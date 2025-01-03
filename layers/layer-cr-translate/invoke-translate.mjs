/**
 * invoke-translate.mjs
 * 
 * This module formats the prompt, invokes bedrock, handles and 
 * formats the streamed response, and returns a results object.
 * 
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/translate/command/TranslateTextCommand/ 
 * 
 */
import { TranslateClient, TranslateTextCommand } from "@aws-sdk/client-translate"; 
const translateClient = new TranslateClient({ region: process.env.AWS_REGION });

async function invokeTranslate(text, sourceLanguageCode, targetLanguageCode) {

    console.info("in [ invokeTranslate ] and text ==> \n" + text);     
    console.info("in [ invokeTranslate ] and sourceLanguageCode ==> \n" + sourceLanguageCode);     
    console.info("in [ invokeTranslate ] and targetLanguageCode ==> \n" + targetLanguageCode);     

    const translateTextCommand = new TranslateTextCommand({ // TranslateTextRequest
        Text: text, // required
        SourceLanguageCode: sourceLanguageCode, // required
        TargetLanguageCode: targetLanguageCode, // required
        Settings: { // TranslationSettings (could be passed in as parameters)
            Formality: "FORMAL" || "INFORMAL",
            Profanity: "MASK",
            Brevity: "ON",
        },
    });

    console.info("in [ invokeTranslate ] and translateTextCommand ==> \n" + JSON.stringify(translateTextCommand, null, 2));  

    const translateResponse = await translateClient.send(translateTextCommand);

    console.info("in [ invokeTranslate ] and translateResponse ==> \n" + JSON.stringify(translateResponse, null, 2));
    
    return translateResponse;
    
    
}

export  { 
    invokeTranslate
};