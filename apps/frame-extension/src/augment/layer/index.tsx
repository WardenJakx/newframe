import React from 'react'
import { createRoot } from 'react-dom/client'

import Layer from './Layer'

const layer = document.createElement('div')
layer.id = '__frameLayer__'
document.body.appendChild(layer)
layer.style.cssText = `
  position: fixed;
  top: 0px;
  right: 0px;
  bottom: 0px;
  left: 0px;
  pointer-events: none;
  z-index: 2000;
  overscroll-behavior: none;
`
createRoot(layer).render(<Layer />)
