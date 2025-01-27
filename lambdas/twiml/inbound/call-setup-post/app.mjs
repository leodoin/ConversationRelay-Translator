/**
 * call-setup-post
 * 
 * Handle inbound call and set up <ConversationRelay></ConversationRelay>
 * for the "Caller" (the party that initiated the call).
 * 
 */

import querystring from 'node:querystring';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
const dynClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const ddbDocClient = DynamoDBDocumentClient.from(dynClient);

// Helper functions from Lambda Layers
import { invokeTranslate } from '/opt/invoke-translate.mjs';

export const lambdaHandler = async (event, context) => {     
    
    /**
     * 1) Parse BODY of request to extract Call Details
     * 2) Use From number to look up user record (if exists)
     * 3) Determine Translation session params to use
     * 4) Generate Twiml to spin up ConversationRelay connection
     */
    
    console.info("EVENT ==>\n" + JSON.stringify(event, null, 2));    
    
    // 1) Parse BODY of request to extract Call Details
    
    let bufferObj = Buffer.from(event.body, "base64");    
    let twilio_body = querystring.decode(bufferObj.toString("utf8"));

    console.info("twilio_body ==>\n" + JSON.stringify(twilio_body, null, 2));        

    try {

        // 2) Use From number to look up user record (if exists)

        /**
         * GetUserContext (Caller)
         * 
         * API call to get context for this user. This could be a simple 
         * DynamoDB query or a more complex call to a CRM / CDP system.
         * 
        */

        /**
         * The Voice and Language options need to be set for each session.
         * It is possible to change them on the fly as well!
         * 
         * ConversationRelay Voices:
         * https://www.twilio.com/docs/voice/twiml/connect/conversationrelay#additional-tts-voices-available-for-conversationrelay
         * 
         * AWS Translate Languages:
         * https://docs.aws.amazon.com/translate/latest/dg/what-is-languages.html
         * en => English
         * es => Spanish
         * es-MX => Spanish (Mexico)
         * it => Italian
         * fr => French
         * de => German
         * pt => Portuguese (Brazil)
         * 
        */
        const user = await ddbDocClient.send( new GetCommand( { TableName: process.env.TABLE_NAME, Key: { pk: twilio_body.From, sk: "profile" } } ));
        let userContext = {};
        if (user.Item) {
            userContext = user.Item;
        } else {
            // Default user context if no profile found
            userContext = {
                name: "Dan",
                sourceLanguageCode: "en", // ("en") What AWS Translate uses to translate
                sourceLanguage: "en-US", // ("en-US") What ConversationRelay uses                
                sourceLanguageFriendly: "English - United States", // ("en-US") What ConversationRelay uses                
                sourceTranscriptionProvider: "Deepgram", // ("Deegram") Provider for transcription
                sourceTtsProvider: "Amazon", // ("Amazon") Provider for Text-To-Speech
                sourceVoice: "Matthew-Generative", // ("Matthew-Generative") Voice for TTS (depends on ttsProvider)                
            };
        }
        console.info("userContext ==>\n" + JSON.stringify(userContext, null, 2));    

        // 3) Determine Translation session params to use
        /** 
         * These properties are passed as parameters to the ConversationRelay
         * and included in the setup websocket message.
        */

        let customParams = {
            ...userContext, // Add all properties from userContext        
            To: twilio_body.To,
            From: twilio_body.From,
            SortKey: twilio_body.From,            
            AccountSid: twilio_body.AccountSid,
            SourceCallSid: twilio_body.CallSid,
            translationActive: false,
            whichParty: "caller",
            targetConnectionId: "notset", // opposite party
            targetLanguageCode: "notset", // opposite party (for example, "es-MX") for AWS Translate
            targetLanguage: "notset", // opposite party (for example, "es-MX") for ConversationRelay
            targetLanguageFriendly: "Spanish - Mexico", // opposite party (for example, "Spanish - Mexico") for ConversationRelay
            targetTranscriptionProvider: "notset", // opposite party
            targetTtsProvider: "notset", // opposite party
            targetVoice: "notset", // opposite party (for example, "es-MX") voice used by ConversationRelay 
            targetCallSid: "notset", // opposite party
        };
        
        /**
         * Params for the Conversation Relay Twilio TwiML. The properties
         * of conversationRelayParams object are set as attributes IN 
         * the ConterationRelay TwiML tag. This can be dynamic
         * per user session!
        */

        let welcomeGreeting = "Please wait while we connect you to a translator."

        // Get a localized version of the welcome message if not in English
        if (userContext.sourceLanguageCode !== "en" && userContext.sourceLanguageCode !== "en-US") {
            let translateObject = await invokeTranslate(welcomeGreeting, "en", userContext.sourceLanguageCode);
            welcomeGreeting = translateObject.TranslatedText;
        }        
        
        let conversationRelayParams = {
            welcomeGreeting: welcomeGreeting,
            dtmfDetection: false,
            interruptByDtmf: false,
            language: userContext.sourceLanguage,
            transcriptionProvider: userContext.sourceTranscriptionProvider,
            ttsProvider: userContext.sourceTtsProvider,
            voice: userContext.sourceVoice,
        };

        // 4) Generate Twiml to spin up ConversationRelay connection

        // Pull out params passed as attribute to the ConsationRelay TwiML tag
        //  ==> Could be dynamic for language, tts, stt...
        let conversationRelayParamsString = "";
        for (const [key, value] of Object.entries(conversationRelayParams)) {
            conversationRelayParamsString += `${key}="${value}" `;
            console.log(`${key}: ${value}`);
        }

        // These Passed as <Parameters></Parameters> into "setup" message sent by ConversationRelay
        let customParamsString = "";
        for (const [key, value] of Object.entries(customParams)) {
            customParamsString += `            <Parameter name="${key}" value="${value}" />
`;
            console.log(`${key}: ${value}`);
        }        

        // Generate Twiml to spin up ConversationRelay connection
        let twiml = `<?xml version="1.0" encoding="UTF-8"?><Response>    
    <Connect>
        <ConversationRelay url="${process.env.WS_URL}" ${conversationRelayParamsString}>
            ${customParamsString}
        </ConversationRelay>
    </Connect>
</Response>`;
        
        console.log("twiml ==> ", twiml);

        // Return the twiml to Twilio
        return {
            'statusCode': 200,headers: {'Content-Type': 'application/xml'},
            body: twiml
        };

    } catch (err) {

        console.log("Error using handling call => ", err);                
        return false

    }        
        
};