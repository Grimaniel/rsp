const axios = require('axios');
const BaseDAO = require('../../Application/DAO/BaseDAO');
const AcumaticaSessionDAO = require('../../Application/DAO/AcumaticaSessionDAO');
const moment = require('moment');

async function validateAcumaticaSession() {
    let cookie = ``;
    const getAcumaticaLastSessionResult = await AcumaticaSessionDAO.getAcumaticaLastSession();

    if (getAcumaticaLastSessionResult) {
        console.log("111");
        cookie = getAcumaticaLastSessionResult.companyid + "; " + getAcumaticaLastSessionResult.userbranch + "; " + getAcumaticaLastSessionResult.token + "; " + getAcumaticaLastSessionResult.sessionid + "; " + getAcumaticaLastSessionResult.locale;
    } else {
        console.log("2");
        const date = new Date().toLocaleString('sv-SE', { timeZone: 'US/Central' });
        const login = await loginAcumatica(cookie);
        const data = {
            companyid: login.companyid,
            userbranch: login.userbranch,
            token: login.token,
            sessionid: login.sessionid,
            locale: login.locale,
            expiration_date: moment(date).add(30, 'minutes').format('YYYY-MM-DD HH:mm:ss')
        };
        
        await BaseDAO.insert('ACUMATICA_SESSION', data);

        cookie = data.companyid + "; " + data.userbranch + "; " + data.token + "; " + data.sessionid + "; " + data.locale;
    }
    return cookie;
}

async function loginAcumatica() {
    const params = {
        method: 'post',
        url: 'https://rivafloors.acumatica.com/entity/auth/login',
        headers: {
            'Content-Type': 'application/json',
        },
        data: {
            name: 'mhiga',
            password: '654321'
            //password: '654321'
        }
    };

    const response = await axios(params);
    const [sessionid] = response.headers["set-cookie"][0].split(";");
    const [userbranch] = response.headers["set-cookie"][1].split(";");
    const [locale] = response.headers["set-cookie"][2].split(";");
    const [companyid] = response.headers["set-cookie"][3].split(";");
    const [token] = response.headers["set-cookie"][4].split(";");

    return {
        sessionid,
        userbranch,
        locale,
        companyid,
        token
    }
}

class AcumaticaService {
    static async sendRequest(method, entity, path = '', filter = '', expand = '', select = '', data = '', isFile = false, contentType = '') {
        const cookie = await validateAcumaticaSession();
        let params = {
            method: method,
            url: `https://rivafloors.acumatica.com/entity/RivafloorsSand/20.200.001/${entity}/${path}?${filter}&${expand}&${select}`,
            headers: {
                'Cookie': cookie,
                'Content-Type': isFile === true ? contentType : 'application/json',
            }
        }
        if (data != '') params.data = data;

        console.log('class AcumaticaService - params:', params);

        return await axios(params);
    }
}

module.exports = AcumaticaService;