const swaggerAutogen = require('swagger-autogen')()

const outputFile = './swagger_output.json'
const APIfiles = ['./index.js']

swaggerAutogen(outputFile, APIfiles)