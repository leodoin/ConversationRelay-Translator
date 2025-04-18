/**
 *  twiml/outbound/initiate-call/app.mjs
 * 
 * This lambda is triggered by an SNS message when a caller needs
 * to be connected to an agent (Callee) using translation services. 
 * 
 * The agent can be selected by an API call or some process, and then the
 * ConversationRelay setting is established (Twilio SDK) and then the 
 * Caller and Callee are connected and able to communicate 
 * regardless of language.
 * 
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
const dynClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const ddbDocClient = DynamoDBDocumentClient.from(dynClient);

// Helper functions from Lambda Layers
import { invokeTranslate } from '/opt/invoke-translate.mjs';

// Add a test function to handle the special SSM test case
export async function handleSSMTest(event) {
  if (event.action === 'testSSM' && event.parameterName) {
    try {
      const { SSMClient, GetParameterCommand } = await import('@aws-sdk/client-ssm');
      const ssmClient = new SSMClient({ region: process.env.AWS_REGION });
      
      const command = new GetParameterCommand({
        Name: event.parameterName,
        WithDecryption: true
      });
      
      const response = await ssmClient.send(command);
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Parameter retrieved successfully',
          parameterName: event.parameterName,
          parameterExists: true,
          // Don't return the actual value for security, just the first few characters
          parameterValuePreview: response.Parameter.Value.substring(0, 3) + '...'
        })
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: 'Error retrieving parameter',
          error: error.message,
          parameterName: event.parameterName
        })
      };
    }
  }
  return null; // Not an SSM test
}

// Add a test function to handle direct translation testing
export async function handleTranslateTest(event) {
  if (event.action === 'testTranslate' && event.text) {
    try {
      // Import the SSM client to get the current translation provider
      const { SSMClient, GetParameterCommand } = await import('@aws-sdk/client-ssm');
      const ssmClient = new SSMClient({ region: process.env.AWS_REGION });
      
      // Get the current provider from SSM
      let provider = process.env.TRANSLATION_PROVIDER || 'aws';
      try {
        const command = new GetParameterCommand({
          Name: process.env.TRANSLATION_PROVIDER_PARAM || '/translation/PROVIDER'
        });
        const response = await ssmClient.send(command);
        provider = response.Parameter.Value;
      } catch (error) {
        console.warn('Failed to get translation provider from SSM, using default:', provider);
      }
      
      const result = await invokeTranslate(
        event.text,
        event.sourceLanguageCode || 'en', 
        event.targetLanguageCode || 'es'
      );
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Translation completed successfully',
          originalText: event.text,
          translatedText: result.TranslatedText,
          sourceLanguageCode: result.SourceLanguageCode,
          targetLanguageCode: result.TargetLanguageCode,
          provider: provider
        })
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: 'Error performing translation',
          error: error.message,
          text: event.text
        })
      };
    }
  }
  return null; // Not a translate test
}

export const lambdaHandler = async (event, context) => {
  console.info('EVENT', JSON.stringify(event, null, 2));
  
  // Check if this is an SSM test request (direct invocation)
  const ssmTestResponse = await handleSSMTest(event);
  if (ssmTestResponse) {
    return ssmTestResponse;
  }
  
  // Check if this is a direct translation test
  const translateTestResponse = await handleTranslateTest(event);
  if (translateTestResponse) {
    return translateTestResponse;
  }
  
  // Check if this is an SNS event
  if (event.Records && event.Records[0] && event.Records[0].Sns) {
    // Only import Twilio when handling actual call events
    const twilio = await import('/opt/twilio/index.js');
    
    let snsPayload = JSON.parse(event.Records[0].Sns.Message);
    
    console.info("EVENT\n" + JSON.stringify(event, null, 2));    
    console.info("Message\n" + JSON.stringify(snsPayload, null, 2));    

    try {
      
      let agentContext = {};

      if (snsPayload?.calleeDetails && Boolean(snsPayload?.calleeDetails) === true) {

        /**
         * If calleeDetails boolean is present, that means that the 
         * Agent Context (Callee) is to be set by the Caller record in the database.
         */
        agentContext = {
          name: snsPayload.calleeName,
          sourceLanguageCode: snsPayload.calleeLanguageCode, // ("es-MX") What AWS Translate uses to translate
          sourceLanguage: snsPayload.calleeLanguage, // ("es-MX") What ConversationRelay uses      
          sourceLanguageFriendly: snsPayload?.calleeLanguageFriendly, // ("es-MX") What ConversationRelay uses      
          sourceTranscriptionProvider: snsPayload.calleeTranscriptionProvider, // ("Deepgram") Provider for transcription
          sourceTtsProvider: snsPayload.calleeTtsProvider, // ("Amazon") Provider for Text-To-Speech
          sourceVoice: snsPayload.calleeVoice, // ("Lupe-Generative") Voice for TTS (depends on ttsProvider)
        };

        if (snsPayload?.calleeNumber !== undefined) {
          agentContext.calleeNumber = snsPayload.calleeNumber;
        }

      } else {

        /**
         * GetAgentContext (Callee)
         * 
         * API call to get the agent available to take the call and their
         * details. This could be a simple DynamoDB query or a more complex call to
         * a queueing / routing system.
        */
        const agent = await ddbDocClient.send( new GetCommand( { TableName: process.env.TABLE_NAME, Key: { pk: "agent", sk: "profile" } } ));
        
        if (agent.Item) {
          agentContext = agent.Item;
        } else {

          // If no agent is found are not sent in by snsPayload, use defaults
          agentContext = {
            name: "English",
            sourceLanguageCode: "en",
            sourceLanguage: "en-US",
            sourceLanguageFriendly: "English - United States",
            sourceTranscriptionProvider: "Deepgram",
            sourceTtsProvider: "Amazon",
            sourceVoice: "Matthew-Generative"
          };
        }
      }

      // Use the agent phone number if it exists, otherwise use the default 
      // If you are just trying things, out you can use the default number or "hardcoded" number
      // to go to a specific handset.
      let calleeNumber = (agentContext?.calleeNumber) ? agentContext.calleeNumber : process.env.AGENT_PHONE_NUMBER;
      
      // Call the agent from the Twilio number that the Caller called, or use a default
      // If you are using a PROXY number to link the caller to this callee, be sure that 
      // snsPayload.To is set to the PROXY number!
      let callFrom = (snsPayload.To) ? snsPayload.To : process.env.TWILIO_DEFAULT_FROM;    
      
      /** 
       * These properties are passed as parameters to the ConversationRelay
       * and included in the setup websocket message.
      */
      
      let customParams = {
        ...agentContext, // Add all properties from agentContext
        To: calleeNumber, // This the number that will be called!
        From: snsPayload.To, // Number that the Caller called (Twilio Number)
        SortKey: snsPayload.To,            
        AccountSid: snsPayload.AccountSid,
        parentConnectionId: snsPayload.pk, // This is the Caller's connection ID, all text saved using this key
        translationActive: true,
        whichParty: "callee",    
        callerPhone: snsPayload.From, // Caller Phone Number
        targetConnectionId: snsPayload.pk, // Caller connection ID
        targetLanguageCode: snsPayload.sourceLanguageCode, // Caller
        targetLanguage: snsPayload.sourceLanguage, // opposite party (Caller)
        targetTranscriptionProvider: snsPayload.sourceTranscriptionProvider, // opposite party (Caller)
        targetTtsProvider: snsPayload.sourceTtsProvider, // opposite party (Caller)
        targetVoice: snsPayload.sourceVoice, // opposite party (Caller)
        targetCallSid: snsPayload.sk2 // Call SID for the caller
      };

      let customParamsString = "";
      for (const [key, value] of Object.entries(customParams)) {
          customParamsString += `      <Parameter name="${key}" value="${value}" />
      `;
          console.log(`${key}: ${value}`);
      }       
      
      let welcomeMessage = "Initiating translation session.";
                        
      // Get a localized version of the welcome message if not in English
      if (agentContext.sourceLanguageCode !== "en" && agentContext.sourceLanguageCode !== "en-US") {
          let translateWaitObject = await invokeTranslate(welcomeMessage, "en", agentContext.sourceLanguageCode);
          welcomeMessage = translateWaitObject.TranslatedText;
      }

      /**
       * Params for the Conversation Relay Twilio TwiML. The properties
       * of conversationRelayParams object are set as attributes IN 
       * the ConterationRelay TwiML tag. This can be dynamic
       * per user session!
      */
      
      let conversationRelayParams = {
        welcomeGreeting: welcomeMessage,
        dtmfDetection: false,
        interruptByDtmf: false,
        language: agentContext.sourceLanguage,
        transcriptionProvider: agentContext.sourceTranscriptionProvider,
        ttsProvider: agentContext.sourceTtsProvider,
        voice: agentContext.sourceVoice,    
      };  
      
      /** 
       * Pull out params for attributes for ConversationRelay TwiML tag ==> 
       * Could be dynamic for language, tts, stt...
      */
      let conversationRelayParamsString = "";
      for (const [key, value] of Object.entries(conversationRelayParams)) {
          conversationRelayParamsString += `${key}="${value}" `;
          console.log(`${key}: ${value}`);
      }

      // Generate Twiml to spin up ConversationRelay connection
      let twiml = `<Response>
      <Connect>
        <ConversationRelay url="${process.env.WS_URL}" ${conversationRelayParamsString}>
          ${customParamsString}
        </ConversationRelay>
      </Connect>
    </Response>`;
      
    // Use the Twilio SDK to initiate the call
      const callResponse = await twilio.default.calls.create({    
        from: callFrom,
        from_formatted: snsPayload.From,
        to: calleeNumber,
        twiml: twiml,
      });
      
      console.info("callResponse\n" + JSON.stringify(callResponse, null, 2));    

      // Save the proxy session in the database
      /**
       * Since this solution spins up two separate calls, one to the Caller and one to the Callee,
       * there needs to be a way to link the two calls together. This CAN be done using a "proxy" record
       * where a pool of numbers is available and one is selected to call the Callee. The application
       * handling the call for the Callee can then use the proxy number to make a query link the 
       * two calls together. Once the cals have been connected, the proxy record can be deleted and/or
       * the number could become available to be used to connect other sessions. There are many ways
       * this can be done, but this is a simple way to link the two calls together.
       */
      const proxyItem = {
        pk: "proxy",
        sk: callFrom,
        callerCallSid: snsPayload.sk2,
        calleeCallSid: callResponse.sid,
        lastProxy: Date.now(),
        expireAt: Math.floor(Date.now() / 1000) + 300, // Delete Record after 1 minute -- short lived proxy session!
      };
      console.info("proxyItem\n" + JSON.stringify(proxyItem, null, 2));    

      // Save the proxy session in the database so it is available to the application managed
      
      await ddbDocClient.send(
          new PutCommand({
              TableName: process.env.TABLE_NAME,
              Item: proxyItem
          })
      );          

      return true;

    } catch (error) {
      
      console.error("Error\n" + JSON.stringify(error, null, 2));    
      return false;

    }
      
  } else {
    // Handle other direct invocation types
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: 'Unsupported event type',
        event: event
      })
    };
  }
}