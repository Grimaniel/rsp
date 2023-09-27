const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });
const BaseDAO = require("../Application/DAO/BaseDAO");
const SalesOrderDAO = require("../Application/DAO/SalesOrderDAO");
const ClientDAO = require("../Application/DAO/ClientDAO");
const BusinessApplicationDAO = require("../Application/DAO/BusinessApplicationDAO");
const ContactDAO = require("../Application/DAO/ContactDAO");


const ses = new AWS.SES();

async function createRewardsClient(data) {

  let response = {};

  try {
    response = await BaseDAO.insert(process.env.RSP_REWARDS_CLIENT, data);
  } catch (e) {
    response = e;
  }

  return response;
}

async function getClientByIdCustomer(idCustomer) {

  let response = {};

  try {
    response = await BaseDAO.get(process.env.RSP_REWARDS_CLIENT, `id_customer='${idCustomer}'`);
  } catch (e) {
    response = e;
  }

  return response;
}

async function getRemainingCreditLimitForSalesOrderHoldUp(customerId) {

  let response = {};

  try {
    response = await ClientDAO.getRemainingCreditLimitForSalesOrderHoldUp(customerId);
  } catch (e) {
    response = e;
  }

  return response;
}

async function updateClientByIdCustomer(idcustomer, data) {

  let response = {};

  try {
    response = await BaseDAO.update(process.env.RSP_REWARDS_CLIENT, data, `id_customer=${idcustomer}`);
  } catch (e) {
    response = e;
  }

  return response;
}

async function getPointByInvoiceNbr(invoicenbr) {

  let response = {};

  try {
    response = await BaseDAO.get('RSP_REWARDS_POINT', `invoice_nbr='${invoicenbr}'`);
  } catch (e) {
    response = e;
  }

  return response;
}

async function createSalesOrderOnTemporaryHold(data) {

  let response = {};

  try {
    response = await BaseDAO.insert(process.env.REWARDS_SALES_ORDER_ACUMATICA, data);
  } catch (e) {
    response = e;
  }

  return response;
}

async function validateSaleOrderHoldUpInventory(saleOrderNbr) {
  let response = {};

  try {
    response = await SalesOrderDAO.validateSaleOrderHoldUpInventory(saleOrderNbr);
  } catch (e) {
    response = e;
  }

  return response;
}

async function releaseSalesOrderOnTemporaryHold(status, saleOrderNbr) {
  let response = {};

  try {
    response = await SalesOrderDAO.releaseSalesOrderOnTemporaryHold(status, saleOrderNbr);
  } catch (e) {
    response = e;
  }

  return response;
}

async function getExpiredSalesOrders() {

  let response = {};

  try {
    response = await SalesOrderDAO.getExpiredSalesOrders();
  } catch (e) {
    response = e;
  }

  return response;
}

async function getCustomerBusinessApp(id) {
  let response = {};

  try {
    let getResult = await BaseDAO.get(process.env.RSP_BUSINESS_APPLICATION, `id_business_app=${id}`);
    response = getResult;
  } catch (e) {
    response = e;
  }

  return response;
};

async function createCustomerBusinessApp(type_creation, data) {
  let response = {};

  try {
    const { insertId } = await BaseDAO.insert(process.env.RSP_BUSINESS_APPLICATION, data);
    if (type_creation == "OTPCODE") {
      await BaseDAO.update(process.env.RSP_OTP_CODE, { status: process.env.STATUS_OTP_CODE_REGISTERED }, `id_otp_code=${data.id_otp_code}`);
    } else {
      await BaseDAO.update(process.env.RSP_CONTACT, { status: process.env.STATUS_TO_REVIEW_CONTACT }, `id_contact=${data.id_contact}`);
      let getContactByIdResult = await BaseDAO.getContactById(data.id_contact);
      //CORREO STEP 2 - FLUJO 2
      let mail_body = `
            <!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Rivafloors</title>

</head>

<body bgcolor="#000000" leftmargin="0" topmargin="0" marginwidth="0" marginheight="0"
  style="background-color: #000000;">
  <table width="566" cellpadding="0" cellspacing="0" style="border: 0; margin: 0 auto;">
    <tr>
      <td align="center" bgcolor="#000000" height="122" style="background-color: #000000; height: 122px;">
        <img src="https://rspgallery-dev.s3.amazonaws.com/mailing/mailing001.jpg" alt="riva spain" width="148"
          height="77" border="0" galleryimg="no" style="vertical-align: bottom;">
      </td>
    </tr>
    <tr>
      <td>
        <table align="center" width="566" cellpadding="0" cellspacing="0" style="border: 0; margin: 0 auto;">
          <tr>
            <td height="32" style="background-color: #000000;"></td>
          </tr>
          <tr>
            <td
              style="background-color: #000000; color: #ffffff; font-size: 12px; font-family: Verdana, Geneva, Tahoma, sans-serif; text-align: center;">
              Dear <span style="font-weight: 900;">${getContactByIdResult.store_name}</span>
              <br><br>
              We have received your Business Application.
            </td>
          </tr>
          <tr>
            <td height="15" style="background-color: #000000;"></td>
          </tr>
          <tr>
            <td
              style="background-color: #000000; color: #ffffff; font-size: 12px; font-family: Verdana, Geneva, Tahoma, sans-serif; text-align: center;">
              <img src="https://rspgallery-dev.s3.amazonaws.com/mailing/ba-step2.jpg" alt="step2" width="378"
                height="71" border="0" galleryimg="no" style="vertical-align: bottom;">
            </td>
          </tr>
          <tr>
            <td height="15" style="background-color: #000000;"></td>
          </tr>
          <tr>
            <td
              style="background-color: #000000; color: #ffffff; font-size: 12px; font-family: Verdana, Geneva, Tahoma, sans-serif; text-align: center;">
              Thank you for submitting your Business Application.
              <br>
              We are reviewing your information and soon you will be part of the <span style="font-weight: 900;">RIVA
                Family!</span>
            </td>
          </tr>
          <tr>
            <td height="30" style="background-color: #000000;"></td>
          </tr>
          <tr>
            <td align="center" style="background-color: #000000;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 0; margin: 0 auto;">
                <tr>
                  <td>
                    <img src="https://rspgallery-dev.s3.amazonaws.com/mailing/texas-hill-country.jpg" alt="texas hill country" width="274"
                      height="201" border="0" galleryimg="no" style="vertical-align: bottom;">
                  </td>
                  <td width="8"></td>
                  <td>
                    <img src="https://rspgallery-dev.s3.amazonaws.com/mailing/san-marino-miami.jpg" alt="san marino miami" width="284"
                      height="201" border="0" galleryimg="no" style="vertical-align: bottom;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td height="30"></td>
          </tr>
          <tr>
            <td align="center">
              <img
                src="https://rspgallery-dev.s3.amazonaws.com/mailing/we-are-design-we-are-innovation-we-are-the-revolution_dark.jpg"
                alt="We are design. We are innovation. We are the revolution" width="549" height="11" border="0"
                galleryimg="no" style="vertical-align: bottom;">
            </td>
          </tr>
          <tr>
            <td height="30" style="background-color: #000000;"></td>
          </tr>
          <tr>
            <td style="background-color: #000000;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 0; margin: 0 auto;">
                <tr>
                  <td bgcolor="#000000" height="30" width="" style="background-color: #000000;">
                    <table width="" cellpadding="0" cellspacing="0" style="border: 0; margin: 0 auto;">
                      <tr>
                        <td width="94">
                          <img src="https://rspgallery-dev.s3.amazonaws.com/mailing/follow-us_dark.jpg" alt="follow us"
                            width="93" height="7" border="0" galleryimg="no" style="vertical-align: middle;">
                        </td>
                        <td width="18"></td>
                        <td width="20">
                          <a href="https://www.facebook.com/Rivafloorseuropeanmade" target="_blank"
                            rel="noopener noreferrer">
                            <img src="https://rspgallery-dev.s3.amazonaws.com/mailing/facebook_dark.jpg" alt="facebook"
                              width="20" height="20" border="0" galleryimg="no" style="vertical-align: bottom;">
                          </a>
                        </td>
                        <td width="7"></td>
                        <td width="20">
                          <a href="https://www.houzz.es/fotos/query/riva-spain" target="_blank"
                            rel="noopener noreferrer">
                            <img src="https://rspgallery-dev.s3.amazonaws.com/mailing/houzz_dark.jpg" alt="houzz"
                              width="19" height="20" border="0" galleryimg="no" style="vertical-align: bottom;">
                          </a>
                        </td>
                        <td width="7"></td>
                        <td width="20">
                          <a href="https://www.instagram.com/rivaspain/" target="_blank" rel="noopener noreferrer">
                            <img src="https://rspgallery-dev.s3.amazonaws.com/mailing/instagram_dark.jpg" alt="instagram"
                              width="20" height="20" border="0" galleryimg="no" style="vertical-align: bottom;">
                          </a>
                        </td>
                        <td width="7"></td>
                        <td width="20">
                          <a href="https://www.linkedin.com/company/rivafloors/" target="_blank"
                            rel="noopener noreferrer">
                            <img src="https://rspgallery-dev.s3.amazonaws.com/mailing/linkedin_dark.jpg" alt="linkedin"
                              width="19" height="20" border="0" galleryimg="no" style="vertical-align: bottom;">
                          </a>
                        </td>
                        <td width="7"></td>
                        <td width="20">
                          <a href="https://www.pinterest.es/rivafloorsfloors/_created/" target="_blank"
                            rel="noopener noreferrer">
                            <img src="https://rspgallery-dev.s3.amazonaws.com/mailing/pinterest_dark.jpg" alt="pinterest"
                              width="20" height="20" border="0" galleryimg="no" style="vertical-align: bottom;">
                          </a>
                        </td>
                        <td width="7"></td>
                        <td width="20">
                          <a href="https://www.youtube.com/channel/UCQOmIpjmqzmxC3fEDe6evgQ" target="_blank"
                            rel="noopener noreferrer">
                            <img src="https://rspgallery-dev.s3.amazonaws.com/mailing/youtube_dark.jpg" alt="youtube"
                              width="19" height="20" border="0" galleryimg="no" style="vertical-align: bottom;">
                          </a>
                        </td>
                        <td width="12"></td>
                      </tr>
                    </table>
                  </td>
                  <td height="30" width="14" style="background-color: #000000;">
                    <img src="https://rspgallery-dev.s3.amazonaws.com/mailing/mailing012_dark.jpg" alt="" width="14"
                      height="30" border="0" galleryimg="no" style="vertical-align: bottom;">
                  </td>
                  <td height="30" width="46" style="background-color: #ffffff;"></td>
                  <td bgcolor="#ffffff" height="30" width="220" style="background-color: #ffffff;">
                    <a href="https://www.rivaspain.com/" target="_blank" rel="noopener noreferrer">
                      <img src="https://rspgallery-dev.s3.amazonaws.com/mailing/mailing013_dark.jpg" alt="www.rivaspain.com"
                        width="198" height="8" border="0" galleryimg="no" style="vertical-align: middle;">
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
      let send_mail = {
        Destination: {
          ToAddresses: [getContactByIdResult.mail]
        },
        Message: {
          Body: {
            Html: {
              Data: mail_body
            }
          },
          Subject: {
            Data: "RIVA NOTIFICATION"
          }
        },
        Source: "rsp-notification@mailling-rivafloors.modobeta.xyz"
      };
      await ses.sendEmail(send_mail).promise();
    }
    let getBusinessAppByIdResult = await BusinessApplicationDAO.getBusinessAppById(insertId);
    response = getBusinessAppByIdResult;
  } catch (e) {
    response = e;
  }

  return response;
}

async function createComments(data, idContact) {
  let response = {};
  try {
    let response_insert_comemt = await BaseDAO.insert(process.env.RSP_DISSAPROVED_COMMENTS, data);
    await BaseDAO.update(process.env.RSP_CONTACT, { status: process.env.STATUS_DISAPPROVED_CONTACT, id_disapprov_comment: response_insert_comemt.insertId }, `id_contact=${idContact}`)
    let response_get_contact = await ContactDAO.getContactById(idContact);
    let mail_body = ``;
    let destination_mail = response_get_contact.mail;
    mail_body = `
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
              height="122"
              style="background-color: #000000; height: 122px"
            >
              <img
                src="https://rspgallery-dev.s3.amazonaws.com/mailing/mailing001.jpg"
                alt="riva spain"
                width="148"
                height="77"
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
                      text-align: left;
                    "
                  >
                    Dear <span style="font-weight: 900">RETAILER</span> <br /><br />
                    Thank you for your interest in
                    <span style="font-weight: 900">RIVA</span>.. We have received
                    your Business Application, unfortunately, after further review,
                    we cannot create your
                    <span style="font-weight: 900">RIVA</span>. E-commerce
                    account.<br />Again, we thank you for your interest in our
                    company and we wish you the best. If you have further questions,
                    do not hesitate to contact us at info@rivaspain.com<br /><br />Sincerely,<br /><br /><span
                      style="font-weight: 900"
                      >RIVA</span
                    >. Team. <br /><br /><br />
                    <!-- We appreciate your support and thank you for being part of <span style="font-weight: 900;">RIVA</span>.
                  <br>
                  <span style="font-size: 10px;">Disclosure note: This version is currently available in the US
                    territory only.</span> -->
                  </td>
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
        `
    let send_mail = {
      Destination: {
        ToAddresses: [destination_mail]
      },
      Message: {
        Body: {
          Html: {
            Data: mail_body
          }
        },
        Subject: {
          Data: "RIVA NOTIFICATION"
        }
      },
      Source: "rsp-notification@mailling-rivafloors.modobeta.xyz"
    };

    let result_send_mail = await ses.sendEmail(send_mail).promise();

    if (result_send_mail.MessageId != "" || result_send_mail.MessageId !== undefined) {
      response = response_get_contact;
    }
  } catch (e) {
    response = e;
  }
  return response;
}

async function getCustomerByContactId(idcontact) {
  let response = {};

  try {
    let getResult = await BaseDAO.get(process.env.RSP_BUSINESS_APPLICATION, `id_contact=${idcontact}`);
    response = getResult;
  } catch (e) {
    response = e;
  }

  return response;
};

module.exports = {
  getClientByIdCustomer,
  getRemainingCreditLimitForSalesOrderHoldUp,
  updateClientByIdCustomer,
  createSalesOrderOnTemporaryHold,
  validateSaleOrderHoldUpInventory,
  releaseSalesOrderOnTemporaryHold,
  getExpiredSalesOrders,
  getCustomerBusinessApp,
  createCustomerBusinessApp,
  getCustomerByContactId,
  createRewardsClient,
  getPointByInvoiceNbr,
  createComments
}