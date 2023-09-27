const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });
const s3 = new AWS.S3();
const nodemailer = require("nodemailer");
const BaseDAO = require('../Application/DAO/BaseDAO');


async function notifySalesOrderDeadlineOnTemporaryHold(id_notification_sales_order, sales_order_nbr, time_left, customer_mail) {
    let response = {};

    try {
        const transporter = nodemailer.createTransport({
            SES: new AWS.SES({ region: 'us-east-1', apiVersion: "2010-12-01" })
        });
        const getPdf = {
            Bucket: process.env.BUCKET_RSP,
            Key: `sales_order/${sales_order_nbr}.pdf`,
            ResponseContentType: "application/pdf"
        };
        const { Body } = await s3.getObject(getPdf).promise();
        const html = `
        <!DOCTYPE html>
        <html lang="en">                
            <head>
                <meta charset="UTF-8" />
                <meta http-equiv="X-UA-Compatible" content="IE=edge" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>Rivafloors</title>                
            </head>                
            <body bgcolor="#000000" leftmargin="0" topmargin="0" marginwidth="0" marginheight="0">
                <h2>Dear Customer, your order ${sales_order_nbr} is on hold and will expire in the next ${time_left} hours. Please take action to confirm the order.</h2>
            </body>                
        </html>`;
        const emailProps = await transporter.sendMail({
            from: process.env.SENDER,
            to: customer_mail,
            subject: 'RIVA NOTIFICATION',
            //text: text,
            html: html,
            attachments: [{
                filename: `${sales_order_nbr}.pdf`,
                content: Body.toString('base64'),
                encoding: 'base64'
            }]
        });
        console.log('emailProps', emailProps);
        const updateResult = await BaseDAO.update(process.env.REWARDS_NOTIFICATION_SALES_ORDER_ACUMATICA, { status: 2 }, `id_notification_sales_order=${id_notification_sales_order}`);
        response = updateResult;
    } catch (e) {
        response = e;
    }
    console.log("response", response);
    return response;
}

async function sendMailPaymentCompleted(data) {
    let response = {};

    try {
        const transporter = nodemailer.createTransport({
            SES: new AWS.SES({ region: 'us-east-1', apiVersion: "2010-12-01" })
        });

        let itemAmount = ''

        let numberFormat = new Intl.NumberFormat('en-US', { currency: 'USD' })

        for(let i = 0; i < data.items.length; i++){
            itemAmount += `
                <tr>
                    <td>${data.items[i]}</td>
                    <td>$ ${numberFormat.format(data.amounts[i])}</td>
                </tr>
            `
        }
        
        const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8" />
                <meta http-equiv="X-UA-Compatible" content="IE=edge" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>Rivafloors</title>
            </head>
            
            <body
                bgcolor="#ffffff"
                leftmargin="0"
                topmargin="0"
                marginwidth="0"
                marginheight="0"
                style="background-color: #ffffff"
            >
                <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                style="border: 0; margin: 0 auto"
                >
                <tr>
                    <td
                    align="center"
                    bgcolor="#000000"
                    height="50"
                    style="background-color: #000000; height: 50px"
                    >
                    <img
                        src="https://rspgallery-dev.s3.amazonaws.com/mailing/mailing001.jpg"
                        alt="riva spain"
                        width="49"
                        height="23"
                        border="0"
                        galleryimg="no"
                        style="vertical-align: bottom"
                    />
                    </td>
                </tr>
                <tr>
                    <td>
                    <table
                        align="center"
                        width="566"
                        cellpadding="0"
                        cellspacing="0"
                        style="border: 0; margin: 0 auto"
                    >
                        <tr>
                        <td height="32" style="background-color: #ffffff"></td>
                        </tr>
                        <tr>
                        <td
                            style="
                            background-color: #ffffff;
                            color: #000000;
                            font-size: 12px;
                            font-family: Verdana, Geneva, Tahoma, sans-serif;
                            "
                        >
                            <span style="font-weight: 900"
                            >Thanks for shopping with us!</span
                            >, <br /><br />
                            <p>Hi <span style="font-weight: 900">${data.clientName}</span></p>
                            <p>
                            Here is the receipt for your order ${data.orderNumber} from your purchase on
                            <span style="font-weight: 900">${data.date}</span>
                            </p>
                        </td>
                        </tr>
                        <tr>
                        <td>
                            <table
                            style="width: 100%"
                            class="table table-hover table-striped"
                            >
                            <thead>
                                <tr>
                                <th style="text-align: left">ITEM</th>
                                <th style="width: 100px; text-align: center">AMOUNT</th>
                                </tr>
                            </thead>
                                <tbody>
                                    ${itemAmount}
                                    <tr>
                                    <td colspan=2>
                                    <hr>
                                    </td>
                                    </tr>
                                    <tr>
                                    <td>Shipping Cost:</td>
                                    <td>$ ${numberFormat.format(data.shippingOrder)}</td>
                                    </tr>
                                    <tr>
                                    <td>Tax:</td>
                                    <td>$ ${numberFormat.format(data.taxOrder)}</td>
                                    </tr>
                                    <tr>
                                    <td>Sub Total:</td>
                                    <td>$ ${numberFormat.format(data.subTotalOrder)}</td>
                                    </tr>
                                    <tr>
                                    <td>Additional Payment Method ${data.paymentMethod} Fee</td>
                                    <td></td>
                                    </tr>
                                    <tr>
                                    <td>Payment Total:</td>
                                    <td>$ ${numberFormat.format(data.totalOrder)}</td>
                                    </tr>
                                </tbody>
                            </table>

                        </td>
                        </tr>
                        
                        <tr>
                        <td height="30" style="background-color: #ffffff"></td>
                        </tr>
                        <tr>
                        <td height="30"></td>
                        </tr>
                        <tr>
                        <td align="center">
                            <img
                            src="https://rspgallery-dev.s3.amazonaws.com/mailing/we-are-design-we-are-innovation-we-are-the-revolution.jpg"
                            alt="We are design. We are innovation. We are the revolution"
                            width="550"
                            height="10"
                            border="0"
                            galleryimg="no"
                            style="vertical-align: bottom"
                            />
                        </td>
                        </tr>
                        <tr>
                        <td height="30" style="background-color: #ffffff"></td>
                        </tr>
                        <tr>
                        <td style="background-color: #ffffff">
                            <table
                            width="100%"
                            cellpadding="0"
                            cellspacing="0"
                            style="border: 0; margin: 0 auto"
                            >
                            <tr>
                                <td
                                bgcolor="#ffffff"
                                height="39"
                                width=""
                                style="background-color: #ffffff"
                                >
                                <table
                                    width=""
                                    cellpadding="0"
                                    cellspacing="0"
                                    style="border: 0; margin: 0 auto"
                                >
                                    <tr>
                                    <td width="94">
                                        <img
                                        src="https://rspgallery-dev.s3.amazonaws.com/mailing/mailing005.jpg"
                                        alt="follow us"
                                        width="94"
                                        height="7"
                                        border="0"
                                        galleryimg="no"
                                        style="vertical-align: middle"
                                        />
                                    </td>
                                    <td width="18"></td>
                                    <td width="20">
                                        <a
                                        href="https://www.facebook.com/Rivafloorseuropeanmade"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        >
                                        <img
                                            src="https://rspgallery-dev.s3.amazonaws.com/mailing/mailing006.jpg"
                                            alt="facebook"
                                            width="20"
                                            height="20"
                                            border="0"
                                            galleryimg="no"
                                            style="vertical-align: bottom"
                                        />
                                        </a>
                                    </td>
                                    <td width="7"></td>
                                    <td width="20">
                                        <a
                                        href="https://www.houzz.es/fotos/query/riva-spain"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        >
                                        <img
                                            src="https://rspgallery-dev.s3.amazonaws.com/mailing/mailing007.jpg"
                                            alt="houzz"
                                            width="20"
                                            height="20"
                                            border="0"
                                            galleryimg="no"
                                            style="vertical-align: bottom"
                                        />
                                        </a>
                                    </td>
                                    <td width="7"></td>
                                    <td width="20">
                                        <a
                                        href="https://www.instagram.com/rivaspain/"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        >
                                        <img
                                            src="https://rspgallery-dev.s3.amazonaws.com/mailing/mailing008.jpg"
                                            alt="instagram"
                                            width="20"
                                            height="20"
                                            border="0"
                                            galleryimg="no"
                                            style="vertical-align: bottom"
                                        />
                                        </a>
                                    </td>
                                    <td width="7"></td>
                                    <td width="20">
                                        <a
                                        href="https://www.linkedin.com/company/rivafloors/"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        >
                                        <img
                                            src="https://rspgallery-dev.s3.amazonaws.com/mailing/mailing009.jpg"
                                            alt="linkedin"
                                            width="20"
                                            height="20"
                                            border="0"
                                            galleryimg="no"
                                            style="vertical-align: bottom"
                                        />
                                        </a>
                                    </td>
                                    <td width="7"></td>
                                    <td width="20">
                                        <a
                                        href="https://www.pinterest.es/rivafloorsfloors/_created/"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        >
                                        <img
                                            src="https://rspgallery-dev.s3.amazonaws.com/mailing/mailing010.jpg"
                                            alt="pinterest"
                                            width="20"
                                            height="20"
                                            border="0"
                                            galleryimg="no"
                                            style="vertical-align: bottom"
                                        />
                                        </a>
                                    </td>
                                    <td width="7"></td>
                                    <td width="20">
                                        <a
                                        href="https://www.youtube.com/channel/UCQOmIpjmqzmxC3fEDe6evgQ"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        >
                                        <img
                                            src="https://rspgallery-dev.s3.amazonaws.com/mailing/mailing011.jpg"
                                            alt="youtube"
                                            width="20"
                                            height="20"
                                            border="0"
                                            galleryimg="no"
                                            style="vertical-align: bottom"
                                        />
                                        </a>
                                    </td>
                                    <td width="12"></td>
                                    </tr>
                                </table>
                                </td>
                                <td
                                height="39"
                                width="17"
                                style="background-color: #ffffff"
                                >
                                <img
                                    src="https://rspgallery-dev.s3.amazonaws.com/mailing/mailing012.jpg"
                                    alt=""
                                    width="17"
                                    height="39"
                                    border="0"
                                    galleryimg="no"
                                    style="vertical-align: bottom"
                                />
                                </td>
                                <td
                                height="39"
                                width="46"
                                style="background-color: #000000"
                                ></td>
                                <td
                                bgcolor="#000000"
                                height="39"
                                width="215"
                                style="background-color: #000000"
                                >
                                <a
                                    href="https://www.rivaspain.com/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <img
                                    src="https://rspgallery-dev.s3.amazonaws.com/mailing/mailing013.jpg"
                                    alt="www.rivaspain.com"
                                    width="172"
                                    height="8"
                                    border="0"
                                    galleryimg="no"
                                    style="vertical-align: middle"
                                    />
                                </a>
                                </td>
                            </tr>
                            </table>
                        </td>
                        </tr>
                    </table>
                    </td>
                </tr>
                </table>
            </body>
            </html>
        `;

        const emailProps = await transporter.sendMail({
            from: process.env.SENDER,
            to: data.clientEmail,
            subject: 'RIVA NOTIFICATION',
            //text: text,
            html: html
        });
        
        response = emailProps;
    } catch (e) {
        response = e;
    }
    
    return response;
}

module.exports = {
    notifySalesOrderDeadlineOnTemporaryHold,
    sendMailPaymentCompleted
}