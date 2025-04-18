const { SSMClient, PutParameterCommand } = require('@aws-sdk/client-ssm');
const fs = require('fs');

// Read profile from file
const profile = fs.readFileSync('./aws-profile.profile', 'utf8').trim();
process.env.AWS_PROFILE = profile;

// Initialize the SSM client
const ssmClient = new SSMClient({ region: 'eu-north-1' });

async function setTranslationProvider(provider) {
  if (!['aws', 'deepl'].includes(provider)) {
    console.error('Invalid provider. Use "aws" or "deepl"');
    process.exit(1);
  }

  try {
    // Update the translation provider in SSM
    const command = new PutParameterCommand({
      Name: '/translation/PROVIDER',
      Value: provider,
      Type: 'String',
      Overwrite: true
    });
    
    const response = await ssmClient.send(command);
    console.log(`Successfully set translation provider to ${provider}`);
    console.log('Version:', response.Version);
    
    // Test the new provider
    await testProvider(provider);
  } catch (error) {
    console.error('Error setting translation provider:', error);
  }
}

async function testProvider(provider) {
  // Import the Lambda client
  const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
  const lambdaClient = new LambdaClient({ region: 'eu-north-1' });
  
  try {
    console.log(`Testing ${provider} translation...`);
    
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
    console.log('Raw response:', responsePayload);
    
    try {
      const result = JSON.parse(responsePayload);
      if (result.body) {
        const body = JSON.parse(result.body);
        
        console.log('Translation result:');
        console.log(`  Original text: "${body.originalText}"`);
        console.log(`  Translated text: "${body.translatedText}"`);
        console.log(`  Provider: ${body.provider}`);
        
        if (body.provider !== provider) {
          console.warn('Warning: Provider in response does not match requested provider. This might be due to a delay in configuration propagation.');
        }
      } else {
        console.log('Response did not contain expected body structure:', result);
      }
    } catch (error) {
      console.error('Error parsing response:', error);
      console.log('Raw response was:', responsePayload);
    }
    
    // If LogType is 'Tail', get the logs
    if (response.LogResult) {
      const logs = Buffer.from(response.LogResult, 'base64').toString();
      console.log('Logs:', logs);
    }
  } catch (error) {
    console.error('Error testing translation:', error);
  }
}

// Get the provider from command line
const provider = process.argv[2]?.toLowerCase();
if (!provider) {
  console.error('Please specify a provider: aws or deepl');
  process.exit(1);
}

// Set the provider
setTranslationProvider(provider); 