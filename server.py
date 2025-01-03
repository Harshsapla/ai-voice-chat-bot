import os
import uuid
import torch
from flask import Flask, request, jsonify  # Ensure jsonify is imported
from flask_cors import CORS
from transformers import GPT2LMHeadModel, GPT2Tokenizer
from google.cloud.dialogflow_v2 import SessionsClient
import dotenv
from waitress import serve  # Import Waitress for production deployment

# Load environment variables
dotenv.load_dotenv()

# Flask app setup
app = Flask(__name__)
CORS(app)

# Ensure required environment variables are set
GOOGLE_CLOUD_PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT_ID")
if not GOOGLE_CLOUD_PROJECT_ID:
    raise ValueError("GOOGLE_CLOUD_PROJECT_ID is not set in environment variables.")

PORT = int(os.getenv("PORT", 5000))

# Load the fine-tuned GPT-2 model and tokenizer
def load_model():
    model = GPT2LMHeadModel.from_pretrained('./fine_tuned_gpt2')
    tokenizer = GPT2Tokenizer.from_pretrained('./fine_tuned_gpt2')
    
    # Set pad token to EOS token
    tokenizer.pad_token = tokenizer.eos_token
    model.config.pad_token_id = tokenizer.eos_token_id
    
    # Use GPU if available
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    
    return model, tokenizer, device

# Load model and tokenizer
model, tokenizer, device = load_model()

# Therapist prompt for conversation context
therapist_prompt = (
    "You are a compassionate AI therapist. Respond empathetically to user inquiries."
)

# Generate text response using GPT-2
def generate_text(user_input: str, max_length: int = 100, temperature: float = 0.7,
                  top_k: int = 30, top_p: float = 0.8, repetition_penalty: float = 1.5) -> str:
    try:
        prompt = (
            f"{therapist_prompt}\n"
            "User: What is the color of the sky?\n"
            "Sage: The sky is blue on a clear day.\n"
            "User: Why do people feel sad?\n"
            "Sage: It's natural to feel sad sometimes. Emotions help us process our experiences.\n"
            f"User: {user_input}\nSage:"
        )

        inputs = tokenizer(prompt, return_tensors="pt", truncation=True, padding=True).to(device)

        output = model.generate(
            inputs.input_ids,
            attention_mask=inputs.attention_mask,
            max_new_tokens=max_length,
            temperature=temperature,
            top_k=top_k,
            top_p=top_p,
            do_sample=True,
            repetition_penalty=repetition_penalty,
            pad_token_id=tokenizer.pad_token_id
        )

        response = tokenizer.decode(output[0], skip_special_tokens=True)

        # Extract response after "Sage:"
        if "Sage:" in response:
            response = response.split("Sage:")[-1].strip()

        # Handle ambiguous responses
        if response.lower() in ["i don't know", "i'm not sure"]:
            response = "I'm here to help, but I might need more information to answer your question."

        return response
    except Exception as e:
        print(f"Error in text generation: {e}")
        return "I'm sorry, I couldn't process your input."

# Initialize Dialogflow client
try:
    session_client = SessionsClient()
except Exception as e:
    print(f"Error initializing Dialogflow client: {e}")
    session_client = None

@app.route('/', methods=['POST'])
def chat():
    # return 'you made it !'
    if not request.is_json:
        print("Received non-JSON request")
        return jsonify({"response": "Request must be JSON."}), 400

    # Log incoming JSON to help debug
    data = request.get_json()
    print("Received data:", data)

    user_input = data.get('text')

    if not user_input or user_input.strip() == "":
        print("No user input provided or input is empty")
        return jsonify({"response": "I didn't understand your input."}), 400

    try:
        # Dialogflow session setup
        session_id = str(uuid.uuid4())
        session_path = session_client.session_path(GOOGLE_CLOUD_PROJECT_ID, session_id)

        # Send request to Dialogflow
        response = session_client.detect_intent(
            session=session_path,
            query_input={
                'text': {
                    'text': user_input,
                    'language_code': 'en-US'
                }
            }
        )

        bot_response = response.query_result.fulfillment_text
        print('Dialogflow response:', bot_response)

        # Fall back to GPT-2 if Dialogflow response is inadequate
        if not bot_response or "I didn't get that" in bot_response:
            print("No recognized intent; generating response using Sage.")
            bot_response = generate_text(user_input)

        return jsonify({'response': bot_response})

    except Exception as e:
        print(f"Error processing request: {e}")
        return jsonify({'response': "I'm sorry, there was an error processing your request."}), 500

@app.errorhandler(404)
def page_not_found(e):
    return jsonify({'error': 'This route is not defined. Please check the API documentation.'}), 404

# Run the app using Waitress for production deployment
if __name__ == '__main__':
    serve(app, host="0.0.0.0", port=PORT)