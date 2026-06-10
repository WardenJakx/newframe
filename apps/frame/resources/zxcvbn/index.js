const { zxcvbn, zxcvbnOptions } = require('@zxcvbn-ts/core')
const common = require('@zxcvbn-ts/language-common')
const en = require('@zxcvbn-ts/language-en')

zxcvbnOptions.setOptions({
  graphs: common.adjacencyGraphs,
  dictionary: { ...common.dictionary, ...en.dictionary },
  translations: en.translations
})

module.exports = zxcvbn
