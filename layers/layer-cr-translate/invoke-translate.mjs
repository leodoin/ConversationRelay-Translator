/**
 * invoke-translate.mjs
 * 
 * This module supports multiple translation providers with a common interface.
 */

// AWS Translate
import { TranslateClient, TranslateTextCommand } from "@aws-sdk/client-translate"; 
const translateClient = new TranslateClient({ region: process.env.AWS_REGION });

// AWS SSM for parameter access
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
const ssmClient = new SSMClient({ region: process.env.AWS_REGION });

// DeepL
import * as deepl from 'deepl-node';
let deeplClient = null;

// Example configuration for different providers
// Read from environment variable first, or default to aws
let TRANSLATION_PROVIDER = process.env.TRANSLATION_PROVIDER || 'aws';

// Function to get the current translation provider from SSM
async function getTranslationProvider() {
  try {
    // If already initialized from SSM, return the cached value
    if (TRANSLATION_PROVIDER !== 'aws' && TRANSLATION_PROVIDER !== process.env.TRANSLATION_PROVIDER) {
      return TRANSLATION_PROVIDER;
    }
    
    // Get the provider from SSM Parameter Store
    const getParamCommand = new GetParameterCommand({
      Name: process.env.TRANSLATION_PROVIDER_PARAM || '/translation/PROVIDER',
      WithDecryption: false
    });
    
    const response = await ssmClient.send(getParamCommand);
    TRANSLATION_PROVIDER = response.Parameter.Value;
    console.log(`Using translation provider from SSM: ${TRANSLATION_PROVIDER}`);
    return TRANSLATION_PROVIDER;
  } catch (error) {
    console.error('Failed to get translation provider from SSM:', error);
    // Fall back to environment variable
    return process.env.TRANSLATION_PROVIDER || 'aws';
  }
}

// Async function to initialize DeepL client
async function initializeDeepL() {
    if (deeplClient) return deeplClient;
    
    try {
        // Get the API key from SSM Parameter Store
        const getParamCommand = new GetParameterCommand({
            Name: process.env.DEEPL_API_KEY_PARAM || '/translation/DEEPL_API_KEY',
            WithDecryption: true
        });
        
        const response = await ssmClient.send(getParamCommand);
        const apiKey = response.Parameter.Value;
        
        // Initialize the DeepL client
        deeplClient = new deepl.Translator(apiKey);
        return deeplClient;
    } catch (error) {
        console.error('Failed to initialize DeepL client:', error);
        throw error;
    }
}

// Language code mappings (AWS to DeepL)
const AWS_TO_DEEPL_LANG = {
  'en': 'EN-US',
  'de': 'DE',
  'es': 'ES',
  'fr': 'FR',
  'it': 'IT',
  'ja': 'JA',
  'pl': 'PL',
  'pt': 'PT-PT',
  'ru': 'RU',
  'zh': 'ZH',
  // Add more mappings as needed
};

const DEEPL_TO_AWS_LANG = {
  'EN-US': 'en',
  'DE': 'de',
  'ES': 'es',
  'FR': 'fr',
  'IT': 'it',
  'JA': 'ja',
  'PL': 'pl',
  'PT-PT': 'pt',
  'RU': 'ru',
  'ZH': 'zh',
  // Add more mappings as needed
};

// Interface for different translation providers
const translationProviders = {
    // AWS Translate implementation
    aws: async (text, sourceLanguageCode, targetLanguageCode) => {
        const translateTextCommand = new TranslateTextCommand({
            Text: text,
            SourceLanguageCode: sourceLanguageCode,
            TargetLanguageCode: targetLanguageCode,
            Settings: {
                Formality: "FORMAL",
                Profanity: "MASK",
                Brevity: "ON",
            },
        });
        const response = await translateClient.send(translateTextCommand);
        return {
            TranslatedText: response.TranslatedText,
            SourceLanguageCode: response.SourceLanguageCode,
            TargetLanguageCode: response.TargetLanguageCode
        };
    },

    // DeepL implementation
    deepl: async (text, sourceLanguageCode, targetLanguageCode) => {
        try {
            // Ensure the DeepL client is initialized
            const client = await initializeDeepL();
            
            // Convert AWS language codes to DeepL format
            const deeplSourceLang = AWS_TO_DEEPL_LANG[sourceLanguageCode] || null; // Pass null to let DeepL auto-detect
            const deeplTargetLang = AWS_TO_DEEPL_LANG[targetLanguageCode] || targetLanguageCode;

            console.log(`DeepL language mapping: ${sourceLanguageCode} -> ${deeplSourceLang}, ${targetLanguageCode} -> ${deeplTargetLang}`);

            // Translate using DeepL
            // If source language is null, DeepL will auto-detect
            const result = await client.translateText(
                text,
                null,  // Auto-detect source language
                deeplTargetLang,
                {
                    formality: 'prefer_more'  // DeepL's equivalent of formal language
                }
            );

            // Return in the standard format
            return {
                TranslatedText: result.text,
                SourceLanguageCode: sourceLanguageCode, // Use the original source language code
                TargetLanguageCode: targetLanguageCode  // Use the original target language code
            };
        } catch (error) {
            console.error('DeepL translation error:', error);
            throw error;
        }
    },

    // Google Cloud Translation implementation
    google: async (text, sourceLanguageCode, targetLanguageCode) => {
        throw new Error('Google translation not implemented');
    }
};

async function invokeTranslate(text, sourceLanguageCode, targetLanguageCode) {
  // Get the current provider
  const provider = await getTranslationProvider();
  
  console.info("Translation request:", {
    provider,
    text,
    sourceLanguageCode,
    targetLanguageCode
  });

  try {
    // Get the appropriate translation provider
    const translationFunction = translationProviders[provider];
    if (!translationFunction) {
      console.warn(`Unsupported translation provider: ${provider}. Falling back to AWS.`);
      return await translationProviders.aws(text, sourceLanguageCode, targetLanguageCode);
    }

    // Invoke the translation
    const result = await translationFunction(text, sourceLanguageCode, targetLanguageCode);
    console.info("Translation response:", result);
    return result;
  } catch (error) {
    console.error("Translation error:", error);
    throw error;
  }
}

export { invokeTranslate };