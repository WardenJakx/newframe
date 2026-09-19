const MARGIN_PROPERTIES = new Set([
  'margin',
  'marginBlock',
  'marginBlockEnd',
  'marginBlockStart',
  'marginBottom',
  'marginEnd',
  'marginInline',
  'marginInlineEnd',
  'marginInlineStart',
  'marginLeft',
  'marginRight',
  'marginStart',
  'marginTop',
  'marginX',
  'marginY',
  'm',
  'mb',
  'mbe',
  'mbs',
  'me',
  'ml',
  'mr',
  'ms',
  'mt',
  'mx',
  'my'
])

function propertyName(property) {
  if (!property || property.computed) {
    return null
  }
  if (property.key.type === 'Identifier') {
    return property.key.name
  }
  if (property.key.type === 'Literal') {
    return String(property.key.value)
  }
  return null
}

function objectProperty(object, name) {
  if (object?.type !== 'ObjectExpression') {
    return null
  }
  return object.properties.find((property) => property.type === 'Property' && propertyName(property) === name)
}

function directMargins(object) {
  if (object?.type !== 'ObjectExpression') {
    return []
  }
  return object.properties.filter(
    (property) => property.type === 'Property' && MARGIN_PROPERTIES.has(propertyName(property))
  )
}

function recipeMargins(call) {
  const recipe = call.arguments[0]
  if (recipe?.type !== 'ObjectExpression') {
    return []
  }

  const margins = []
  const base = objectProperty(recipe, 'base')
  margins.push(...directMargins(base?.value))

  const variants = objectProperty(recipe, 'variants')?.value
  if (variants?.type === 'ObjectExpression') {
    for (const variant of variants.properties) {
      if (variant.type !== 'Property' || variant.value.type !== 'ObjectExpression') {
        continue
      }
      for (const option of variant.value.properties) {
        if (option.type === 'Property') {
          margins.push(...directMargins(option.value))
        }
      }
    }
  }

  const compounds = objectProperty(recipe, 'compoundVariants')?.value
  if (compounds?.type === 'ArrayExpression') {
    for (const compound of compounds.elements) {
      const css = objectProperty(compound, 'css')
      margins.push(...directMargins(css?.value))
    }
  }

  return margins
}

function calledIdentifier(expression) {
  return expression?.type === 'CallExpression' && expression.callee.type === 'Identifier'
    ? expression.callee.name
    : null
}

function classRecipe(openingElement) {
  const attribute = openingElement.attributes.find(
    (candidate) => candidate.type === 'JSXAttribute' && candidate.name.name === 'className'
  )
  if (attribute?.value?.type !== 'JSXExpressionContainer') {
    return null
  }
  const recipeName = calledIdentifier(attribute.value.expression)
  return recipeName ? { attribute, recipeName } : null
}

function exportedComponentForRoot(jsxElement) {
  let node = jsxElement.parent
  while (
    node &&
    (node.type === 'ParenthesizedExpression' ||
      node.type === 'TSAsExpression' ||
      node.type === 'TSSatisfiesExpression' ||
      node.type === 'ChainExpression')
  ) {
    node = node.parent
  }
  let owner = node
  if (node?.type === 'ReturnStatement') {
    owner = node.parent
    while (owner && !/Function/.test(owner.type) && owner.type !== 'ArrowFunctionExpression') {
      owner = owner.parent
    }
  } else if (node?.type !== 'ArrowFunctionExpression') {
    return null
  }
  if (!owner) {
    return null
  }

  if (owner.type === 'FunctionDeclaration') {
    if (
      owner.parent?.type !== 'ExportNamedDeclaration' &&
      owner.parent?.type !== 'ExportDefaultDeclaration'
    ) {
      return null
    }
    return owner.id?.name ?? 'default export'
  }

  const declarator = owner.parent
  const declaration = declarator?.parent
  const exported = declaration?.parent
  if (
    declarator?.type !== 'VariableDeclarator' ||
    declarator.id.type !== 'Identifier' ||
    declaration?.type !== 'VariableDeclaration' ||
    declaration.kind !== 'const' ||
    (exported?.type !== 'ExportNamedDeclaration' && exported?.type !== 'ExportDefaultDeclaration')
  ) {
    return null
  }
  return declarator.id.name
}

const noComponentRootMargin = {
  meta: {
    type: 'problem',
    docs: { description: 'Require parents to own spacing outside component roots.' },
    schema: [],
    messages: {
      rootMargin: '{{component}} applies {{properties}} through {{recipe}}; its parent must own that spacing.'
    }
  },
  create(context) {
    const recipes = new Map()
    const roots = []

    return {
      VariableDeclarator(node) {
        if (
          node.parent?.type !== 'VariableDeclaration' ||
          node.parent.kind !== 'const' ||
          node.id.type !== 'Identifier' ||
          node.init?.type !== 'CallExpression' ||
          node.init.callee.type !== 'Identifier' ||
          node.init.callee.name !== 'cva'
        ) {
          return
        }
        const margins = recipeMargins(node.init)
        if (margins.length > 0) {
          recipes.set(node.id.name, margins)
        }
      },
      JSXOpeningElement(node) {
        const component = exportedComponentForRoot(node.parent)
        if (!component) {
          return
        }
        const recipe = classRecipe(node)
        if (recipe) {
          roots.push({ component, ...recipe })
        }
      },
      'Program:exit'() {
        for (const root of roots) {
          const margins = recipes.get(root.recipeName)
          if (!margins) {
            continue
          }
          const properties = [...new Set(margins.map(propertyName))].join(', ')
          context.report({
            node: root.attribute,
            messageId: 'rootMargin',
            data: { component: root.component, properties, recipe: root.recipeName }
          })
        }
      }
    }
  }
}

export default {
  meta: { name: 'newframe', version: '0.0.0' },
  rules: { 'no-component-root-margin': noComponentRootMargin }
}
