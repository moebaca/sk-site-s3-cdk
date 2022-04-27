// Import libs
const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const SSM = new AWS.SSM();
const https = require('https');
const querystring = require('querystring');

// Generate HTTP redirect response to stay at contact page
const redirectResponse = {
    status: '301',
    statusDescription: 'Moved Permanently',
    headers: {
      'location': [{
        key: 'Location',
        value: 'https://stephenkrawczyk.com/contact.html',
      }]
    },
};

/**
 * This function takes user form input, verifies it's legit with ReCAPTCHA V3 and then shoots 
 * an email to the passed in email as a parameter via SNS. It also leverages SecureString for
 * the encrypted secret ReCAPTCHA key which is a pre-req created in the dependant CDK stack.
**/
exports.handler = async (event, context, callback) => {
  var recaptchaToken;
  
  // Decode request body and store params into variables for processing
  const request = event.Records[0].cf.request;
  const body = Buffer.from(request.body.data, 'base64').toString();
  const formParams = querystring.parse(body);

  // Short circuit bots trying to circumvent ReCAPTCHA
  if (formParams['g-recaptcha-response'] !== '') 
    recaptchaToken = formParams['g-recaptcha-response']; 
  else 
    callback('Something went wrong!', redirectResponse) 
    
  // Validate ReCAPTCHA V3
  const reCaptchaSecret = await getRecaptchaSecret();
  await verifyCaptcha(reCaptchaSecret.Parameter.Value, recaptchaToken)
    .then(success => console.log(`Verified ReCAPTCHA ${success}`))
    .catch(err => {
      console.log(err)
      callback('Failed ReCAPTCHA validation!', redirectResponse);
    })
  
  // Get SSM Param for Topic ARN
  const topicARN = await getTopicARN();
  console.log(topicARN)
    
  // Create SNS publish parameters
  await putSNSMessage(topicARN.Parameter.Value, formParams);
  
  callback(null, redirectResponse);
};

// Grabs encrypted SecureString from SSM
function getRecaptchaSecret() {
  console.log('Retrieving Captcha Secret')
  return SSM.getParameter({
    Name: '/sksite/captcha-secret-key',
    WithDecryption: true
  }).promise();
}

// Verifies against Google endpoint
function verifyCaptcha(reCaptchaSecret, recaptchaToken) {
  const verifyURL = `https://www.google.com/recaptcha/api/siteverify?secret=${reCaptchaSecret}&response=${recaptchaToken}`;
  return new Promise((resolve, reject) => {
    https.get(verifyURL, (resp) => {
      resp.on('data', (d) => {
        if (!JSON.parse(d).success) {
          console.error('Failed Captcha! Rejecting.');
          return reject(JSON.parse(d));
        } else {
          console.log('Passed Captcha! Continuing process.');
          return resolve(JSON.parse(d));
        }
      });
    });
  });
}

// Grabs String from SSM
function getTopicARN() {
  console.log('Retrieving SNS Topic ARN')
  return SSM.getParameter({
    Name: '/sksite/sns/contact-form-topic-arn',
    WithDecryption: true
  }).promise();
}

// Ships SNS email to subscriber
function putSNSMessage(topicARN, formParams) {
  console.log('Putting SNS Message')
  var params = {
    Message: `Fullname: ${formParams['fullname']} 
              Email: ${formParams['email']} 
              Phone: ${formParams['phone']} 
              Comment: ${formParams['comment']}`,  
    TopicArn: topicARN
  };
  console.log(`User Params: ${params}`)
  return new AWS.SNS({apiVersion: '2010-03-31'}).publish(params).promise();
}