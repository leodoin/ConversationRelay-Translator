const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const fs = require('fs');

// Read profile from file
const profile = fs.readFileSync('./aws-profile.profile', 'utf8').trim();
process.env.AWS_PROFILE = profile;

// Initialize the Lambda client
const lambdaClient = new LambdaClient({ region: 'eu-north-1' });

// Test payload for translation
const testPayload = {
  requestContext: {
    connectionId: 'test-connection-id',
    routeKey: '$default'
  },
  body: JSON.stringify({
    action: 'translate',
    text: 'Hello, how are you today?',
    sourceLanguageCode: 'en',
    targetLanguageCode: 'es',
    sessionId: 'test-session-id'
  })
};

// Function to invoke the Lambda
async function testTranslation() {
  try {
    const params = {
      FunctionName: 'CR-TRANSLATOR-default-function',
      Payload: JSON.stringify(testPayload),
      LogType: 'Tail'
    };

    const command = new InvokeCommand(params);
    const response = await lambdaClient.send(command);
    
    // Decode the response
    const responsePayload = Buffer.from(response.Payload).toString();
    console.log('Response:', responsePayload);
    
    // If LogType is 'Tail', get the logs
    if (response.LogResult) {
      const logs = Buffer.from(response.LogResult, 'base64').toString();
      console.log('Logs:', logs);
    }
  } catch (error) {
    console.error('Error invoking Lambda:', error);
  }
}

testTranslation(); 