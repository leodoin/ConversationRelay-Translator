const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const deepl = require('deepl-node');
const fs = require('fs');

// Read profile from file
const profile = fs.readFileSync('./aws-profile.profile', 'utf8').trim();
process.env.AWS_PROFILE = profile;

// Initialize the SSM client
const ssmClient = new SSMClient({ region: 'eu-north-1' });

// Function to get DeepL API key from SSM
async function getDeeplApiKey() {
  try {
    const command = new GetParameterCommand({
      Name: '/translation/DEEPL_API_KEY',
      WithDecryption: true
    });
    
    const response = await ssmClient.send(command);
    return response.Parameter.Value;
  } catch (error) {
    console.error('Error getting DeepL API key:', error);
    throw error;
  }
}

// Test DeepL translation
async function testDeeplTranslation() {
  try {
    // Get the API key from SSM
    const apiKey = await getDeeplApiKey();
    console.log('Successfully retrieved DeepL API key from SSM');
    
    // Initialize DeepL client
    const translator = new deepl.Translator(apiKey);
    
    // Test the API key is valid
    const usage = await translator.getUsage();
    console.log('DeepL usage information:', usage);
    
    // Test translation
    const sourceText = 'Hello, world! How are you doing today?';
    console.log(`Source text (English): "${sourceText}"`);
    
    // Translate to Spanish
    const resultSpanish = await translator.translateText(sourceText, 'en', 'es');
    console.log(`Spanish translation: "${resultSpanish.text}"`);
    
    // Translate to French
    const resultFrench = await translator.translateText(sourceText, 'en', 'fr');
    console.log(`French translation: "${resultFrench.text}"`);
    
    // Translate to German
    const resultGerman = await translator.translateText(sourceText, 'en', 'de');
    console.log(`German translation: "${resultGerman.text}"`);
    
    console.log('DeepL translation test completed successfully');
  } catch (error) {
    console.error('DeepL translation test failed:', error);
  }
}

// Run the test
testDeeplTranslation(); 