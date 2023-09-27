const axios = require("axios");

async function createUser(data) {
    let url = ``;
    if(process.env.ENVIRONMENT == 'dev') {
        url = `https://6lxydznk63.execute-api.us-east-1.amazonaws.com/dev/createUser`;
    } 
    else if(process.env.ENVIRONMENT == 'qa') {
        url = `https://ie88q73i6l.execute-api.us-east-1.amazonaws.com/qa/createUser`;
    }
    else if(process.env.ENVIRONMENT == 'prd') {
        url = `https://hv3ubc6e6b.execute-api.us-east-1.amazonaws.com/prd/createUser`;
    }

    let response = {};
    try {
        var config = {
            method: 'post',
            url: url,
            headers: {
                'Content-Type': 'application/json',
            },
            data: data
        };

        response = await axios(config);
    } catch (e) {
        response = e;
    }
    return response;
}

module.exports = {
    createUser
};