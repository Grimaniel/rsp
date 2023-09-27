const multipartParser = require('lambda-multipart-parser');

class MultipartParser {
    static async transformEvent(event) {
        try {
            const body = await multipartParser.parse(event);
            return body;
        } catch (error) {
            console.error(`Error en transformEvent`, error);
            return error;
        }
    }
}

module.exports = MultipartParser;