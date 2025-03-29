import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const dynClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const ddbDocClient = DynamoDBDocumentClient.from(dynClient);

export const lambdaHandler = async (event, context) => {
  try {
    // Build the TwiML response manually instead of using the Twilio SDK
    let twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="/initiate-translation-session" method="POST" timeout="10">
    <Say voice="Polly.Joanna">For English, press 1.</Say>
    <Say voice="Polly.Marlene">Für Deutsch, drücken Sie 2.</Say>
    <Say voice="Polly.Conchita">Para español, presione 3.</Say>
    <Say voice="Polly.Celine">Pour français, appuyez sur 4.</Say>
    <Say voice="Polly.Tatyana">Для русского языка, нажмите 5.</Say>
    <Say voice="Polly.Ewa">Dla języka polskiego, naciśnij 6.</Say>
  </Gather>
  <Redirect>/language-selector</Redirect>
</Response>`;
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/xml' },
      body: twimlResponse
    };
    
  } catch (error) {
    console.error('Error:', error);
    // Even in case of error, return valid TwiML
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're sorry, but there was an error processing your request.</Say>
</Response>`;
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/xml' },
      body: errorTwiml
    };
  }
};