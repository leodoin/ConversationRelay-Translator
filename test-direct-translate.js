const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const fs = require('fs');

// Read profile from file
const profile = fs.readFileSync('./aws-profile.profile', 'utf8').trim();
process.env.AWS_PROFILE = profile;

// Initialize the Lambda client
const lambdaClient = new LambdaClient({ region: 'eu-north-1' });

// Test direct translation
async function testDirectTranslation() {
  try {
    console.log("Waiting 5 seconds to allow configuration changes to propagate...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Create a payload for direct translation
    const testPayload = {
      action: 'testTranslate',
      text: 'Hello, how are you today?',
      sourceLanguageCode: 'en',
      targetLanguageCode: 'es'
    };

    const params = {
      FunctionName: 'CR-TRANSLATOR-TwilioInitiateCallFunction',
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

// Run the test
testDirectTranslation(); 