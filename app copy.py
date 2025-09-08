from flask import Flask, request, jsonify
from pymongo import MongoClient
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests

# Connect to MongoDB
client = MongoClient("mongodb+srv://maxmp717:Max%4012345@cluster0.ceixn4p.mongodb.net/")  # Update with your MongoDB URL if needed
db = client["audioDB"]  # Database name
collection = db["trackdata"]   # Collection name

@app.route('/api/audio', methods=['POST'])
def receive_audio_data():
    print('received server')
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'Invalid data'}), 400

    # Extract required fields
    audio_data = {
        "speakerid":data.get("speakerId"),
        "name": data.get("name"),
        "gender": data.get("gender"),
        "age": data.get("age"),
        "country": data.get("country"),
        "speakerId_sequence": data.get("speakerId_sequence"),
        "speed": data.get("speed"),
        "text": data.get("text"),
    }

    # Insert into MongoDB
    inserted_id = collection.insert_one(audio_data).inserted_id

    return jsonify({'message': 'Data saved successfully', 'id': str(inserted_id)})

if __name__ == '__main__':
    app.run(debug=True, port=7000)
