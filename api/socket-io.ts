import { createServer } from 'node:http'

const server = createServer((_request, response) => {
  response.end('ok')
})

export default server
