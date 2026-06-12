const types: Record<string, string> = {
  html: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  ttf: 'application/font-sfnt',
  svg: 'image/svg+xml',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  png: 'image/png'
}

export default (path: string) => types[path.substr(path.lastIndexOf('.') + 1)] || 'text/plain'
