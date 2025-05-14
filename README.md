# ConversationRelay-Translator

A real-time voice translation service built with Twilio ConversationRelay and AWS services.

## Overview

This project enables real-time human-to-human voice translation through phone calls. It uses Twilio's ConversationRelay for voice handling and AWS services (Lambda, DynamoDB, Translate) for the translation layer.

## Getting Started

### Prerequisites

- AWS Account
- Twilio Account
- Node.js 20.x+
- AWS SAM CLI
- AWS CLI configured with appropriate permissions

**reach out to leonardo.doin@deepl.com for AWS and Twilio access (for hackthon purposes)

### Setup

1. Clone this repository:
   ```
   git clone [repository-url]
   cd ConversationRelay-Translator
   ```

2. Install Node.js dependencies:
   ```
   npm --prefix ./layers/layer-cr-twilio-client/nodejs install
   ```

3. Configure AWS profile:
   ```
   cp aws-profile.profile.sample aws-profile.profile
   ```
   Edit `aws-profile.profile` and add your AWS profile name.

4. Set up Twilio credentials:
   - Store your Twilio credentials in AWS Secrets Manager:
     - Secret name: `Twilio-keys`
     - Secret values: 
       - `TWILIO_ACCOUNT_SID`
       - `TWILIO_AUTH_TOKEN`
   
   - Store non-sensitive configuration in AWS SSM Parameter Store:
     - Parameters (with `/twilio/` prefix):
       - `/twilio/AGENT_PHONE_NUMBER`
       - `/twilio/TWILIO_DEFAULT_FROM`

### Deployment

1. Build the SAM application:
   ```
   sam build
   ```

2. Deploy the application:
   ```
   sam deploy --stack-name CR-TRANSLATOR --template template.yaml --profile $(cat ./aws-profile.profile) --capabilities CAPABILITY_NAMED_IAM
   ```
   
   Note: For the first deployment, add `--guided` flag.

3. Configure Twilio:
   - Take the output from the stack called "TwimlAPI"
   - In your Twilio console, add this URL to the Webhook for Voice handler for your Twilio phone number

### Data Configuration

Load a sample caller profile into DynamoDB:
```
aws dynamodb put-item --table-name CR-TRANSLATOR-AppDatabase --item "$(node ./configuration/dynamo-loaders/profile-caller-example.js | cat)" --profile $(cat ./aws-profile.profile)
```

Edit the profile in `configuration/dynamo-loaders/profile-caller-example.js` to configure:
- Language settings for caller and callee
- Phone numbers
- Voice preferences
- TTS and transcription providers

## Architecture

The application uses:
- AWS Lambda for serverless execution
- API Gateway for WebSocket communication with Twilio
- DynamoDB for state management and profile storage
- AWS Translate for language translation
- Twilio ConversationRelay for voice handling and call management

## DeepL Hackathon Ideas

### TODO List for Hackathon

1. **DeepL Translation Integration**
   - Replace AWS Translate with DeepL API for higher quality translations
   - Implement language auto-detection using DeepL capabilities
   - Add support for more languages and regional variants

2. **DeepL Voice API Integration**
   - Connect solution with DeepL Voice APIs (might require deplowing in our own infra)
   - Modify ConversationRelay SDK to work with raw audio PCM streams
   - Add TTS from AWS poly (or other providers)


4. **Dynamic Call Routing Features**
   - Implement IVR system to select destination number
   - Add language selection menu for both caller and callee
   - Create a system to store and retrieve frequent contacts

5. **Advanced Features**
   - Implement voice signature verification
   - Add real-time cultural context additions to translations
   - Create a web dashboard for call history and analytics

6. **Conversation Enhancement**
   - Add real-time summarization of conversation
   - Implement sentiment analysis for better voice modulation
   - Create a post-call transcript with translations
7. **Multi-party Translation**
   - Extend the system to support conference calls with multiple languages
   - Implement speaker identification with different voices for each participant

## Resources

- [Twilio ConversationRelay Documentation](https://www.twilio.com/docs/voice/twiml/connect/conversationrelay)
- [DeepL API Documentation](https://www.deepl.com/docs-api)
- [AWS SAM Documentation](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html)

## Original Blog Post
[Enable Real Time Human-to-Human Voice Translation with Twilio ConversationRelay](https://www.twilio.com/en-us/blog/translation-with-conversationrelay) 
