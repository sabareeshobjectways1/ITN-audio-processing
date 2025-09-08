
import matplotlib
matplotlib.use('Agg')  # Set the backend to Agg before importing pyplot
import matplotlib.pyplot as plt
from io import BytesIO
from flask import Flask, request, jsonify
from pymongo import MongoClient
from flask_cors import CORS
import os
from datetime import datetime
import uuid
import tempfile
import soundfile as sf
import numpy as np
import librosa
import librosa.display
import re
import base64
import pandas as pd
import smtplib
from email.message import EmailMessage
from dotenv import load_dotenv

app = Flask(__name__)
CORS(app)

# Load variables from .env file
load_dotenv()

EMAIL_USER = os.getenv('EMAIL_USER')
EMAIL_PASSWORD = os.getenv('EMAIL_PASSWORD')
EMAIL_SMTP = os.getenv("EMAIL_SMTP")
EMAIL_PORT = os.getenv("EMAIL_PORT")
emails = os.getenv("RECIPIENT_EMAIL", "")
EMAIL_RECIPIENT = [email.strip() for email in emails.split(",") if email.strip()]

# MongoDB setup
client = MongoClient("mongodb+srv://maxmp717:Max%4012345@cluster0.ceixn4p.mongodb.net/")
db = client["audioDB"]
collection = db["trackdata"]

# Create output folder if not exists
OUTPUT_FOLDER = "output"
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

def detect_drops(energy, threshold):
    """Detect only frame drops (single or double frames above threshold)"""
    drops = []
    drop_energy_info = []
    i = 0
    while i < len(energy):
        if energy[i] > threshold:
            start = i
            while i < len(energy) and energy[i] > threshold:
                i += 1
            length = i - start
            if length == 1 or length == 2:  # Only detect single/double frame drops
                drops.append(('drop', start, min(i, len(energy) - 1)))
                drop_energy_info.append(f"{np.max(energy[start:i]):.2f}")
        else:
            i += 1
    return drops, drop_energy_info

def analyze_audio(filepath):
    try:
        # Read audio as int16 to preserve original values
        audio, sr = sf.read(filepath, dtype='int16')
        if len(audio.shape) > 1:
            audio = audio[:, 0]

        # Get audio format info
        subtype_info = sf.info(filepath).subtype_info
        bit_depth_match = re.search(r'(\d+)', subtype_info)
        bit_depth = int(bit_depth_match.group(1)) if bit_depth_match else 16

        # Parameters
        frame_length = 1024
        hop_length = 512
        cutoff_freq = 20000  # 20 kHz
        threshold = 0.02

        # Calculate STFT
        D = librosa.amplitude_to_db(
            np.abs(librosa.stft(audio.astype(float), n_fft=frame_length, hop_length=hop_length)),
            ref=np.max
        )
        frequencies = librosa.fft_frequencies(sr=sr, n_fft=frame_length)

        # Skip if STFT is empty
        if D.shape[1] == 0:
            return {
                'status': 'error',
                'message': 'STFT result is empty'
            }

        # Analyze high frequency content
        high_freq_mask = frequencies >= cutoff_freq
        D_high_freq = D[high_freq_mask, :]
        high_freq_energy = np.sum(librosa.db_to_amplitude(D_high_freq), axis=0)

        # Detect only drops (skip noise detection)
        drops, drop_energy_info = detect_drops(high_freq_energy, threshold)
        
        # Prepare results
        results = {
            'max_sample': int(np.max(audio)),
            'min_sample': int(np.min(audio)),
            'bit_depth': bit_depth,
            'sample_rate': sr,
            'duration': len(audio) / sr,
            'drops': [],
            'is_clean': len(drops) == 0  # False if any drops detected
        }

        # Process drops
        time_axis = np.linspace(0, len(audio) / sr, len(high_freq_energy))
        for drop_type, start, end in drops:
            start_time = time_axis[start] if start < len(time_axis) else time_axis[-1]
            end_time = time_axis[end] if end < len(time_axis) else time_axis[-1]
            
            results['drops'].append({
                'type': drop_type,
                'start': float(start_time),
                'end': float(end_time),
                'max_energy': drop_energy_info.pop(0) if drop_energy_info else None
            })

        return results

    except Exception as e:
        return {
            'status': 'error',
            'message': str(e)
        }

def generate_analysis_image(filepath, drops=None):
    try:
        # Read audio
        audio, sr = sf.read(filepath, dtype='int16')
        if len(audio.shape) > 1:
            audio = audio[:, 0]

        # Parameters
        frame_length = 1024
        hop_length = 512
        cutoff_freq = 20000  # 20 kHz
        threshold = 0.02

        # Calculate STFT
        D = librosa.amplitude_to_db(
            np.abs(librosa.stft(audio.astype(float), n_fft=frame_length, hop_length=hop_length)),
            ref=np.max
        )
        frequencies = librosa.fft_frequencies(sr=sr, n_fft=frame_length)
        high_freq_mask = frequencies >= cutoff_freq
        D_high_freq = D[high_freq_mask, :]
        high_freq_energy = np.sum(librosa.db_to_amplitude(D_high_freq), axis=0)

        # Create figure with larger size
        fig, ax = plt.subplots(2, 1, figsize=(14, 8), sharex=True)

        # Spectrogram (bottom subplot)
        img = librosa.display.specshow(D, sr=sr, hop_length=hop_length, 
                                     x_axis='time', y_axis='linear', ax=ax[1])
        fig.colorbar(img, ax=ax[1], format="%+2.0f dB", label='Amplitude (dB)')
        ax[1].set_ylabel('Frequency (Hz)', fontsize=12)
        ax[1].set_xlabel('Time (s)', fontsize=12)

        # High frequency energy plot (top subplot)
        time_axis = np.linspace(0, len(audio)/sr, len(high_freq_energy))
        
        # Plot energy and threshold
        ax[0].plot(time_axis, high_freq_energy, color='red', linewidth=2, 
                  alpha=0.8, label='High-Freq Energy (20k+ Hz)')
        ax[0].axhline(threshold, color='blue', linestyle='--', 
                     linewidth=1.5, alpha=0.7, label=f'Threshold ({threshold:.2f})')
        
        # Mark drop regions if provided
        if drops:
            for drop in drops:
                start_time = drop['start']
                end_time = drop['end']
                ax[0].axvspan(start_time, end_time, color='blue', alpha=0.3, label='Frame Drop')
        
        # Customize the energy plot
        ax[0].set_ylabel('Energy', color='red', fontsize=12)
        ax[0].tick_params(axis='y', labelcolor='red')
        ax[0].grid(True, alpha=0.3)
        
        # Add title with filename
        filename = os.path.basename(filepath).replace('.wav', '')
        fig.suptitle(f"Audio Analysis: {filename}", fontsize=14, y=1.02)
        
        # Create a unified legend
        handles, labels = [], []
        for a in [ax[0], ax[1]]:
            h, l = a.get_legend_handles_labels()
            handles.extend(h)
            labels.extend(l)
        
        # Remove duplicate labels
        unique = [(h, l) for i, (h, l) in enumerate(zip(handles, labels)) 
                  if l not in labels[:i]]
        fig.legend(*zip(*unique), loc='upper right', bbox_to_anchor=(1.0, 1.0), 
                  fontsize=10, framealpha=1)

        # Save to bytes
        img_bytes = BytesIO()
        plt.tight_layout()
        plt.savefig(img_bytes, format='png', bbox_inches='tight', dpi=120)
        plt.close(fig)
        img_bytes.seek(0)
        
        return img_bytes

    except Exception as e:
        print(f"Error generating analysis image: {e}")
        return None

@app.route('/save_audio', methods=['POST'])
def receive_audio_data():
    print('Received /save_audio request')
    data = request.get_json()

    if not data:
        return jsonify({'error': 'Invalid data'}), 400

    data_uri = data.get("dataURI")
    if not data_uri:
        return jsonify({'error': 'No audio data received'}), 400

    try:
        # Decode audio
        header, encoded = data_uri.split(",", 1)
        audio_bytes = base64.b64decode(encoded)
        temp_filename = f"{uuid.uuid4()}.wav"
        temp_path = os.path.join(tempfile.gettempdir(), temp_filename)

        with open(temp_path, "wb") as f:
            f.write(audio_bytes)

        # Analyze audio
        analysis_results = analyze_audio(temp_path)
        if analysis_results.get('status') == 'error':
            return jsonify({'error': analysis_results['message']}), 400

        # Generate analysis image with drop markings
        image_bytes = generate_analysis_image(temp_path, analysis_results.get('drops'))
        if not image_bytes:
            return jsonify({'error': 'Failed to generate analysis image'}), 500


        # Calculate sequence for this speaker and category
        speaker_id = data.get("speakerId", "unknown")
        category = data.get("speed", "unknown")  # or use another field for category if needed
        # Count existing records for this speaker and category
        seq_count = collection.count_documents({"speakerid": speaker_id, "speed": category})
        seq_num = seq_count + 1
        seq_str = str(seq_num).zfill(4)
        speaker_id_sequence = f"{speaker_id}_{category}_{seq_str}"

        image_filename = f"{speaker_id_sequence}.png"
        image_path = os.path.join(OUTPUT_FOLDER, image_filename)
        # Handle duplicate filenames (shouldn't happen, but just in case)
        counter = 1
        while os.path.exists(image_path):
            image_filename = f"{speaker_id_sequence}_{counter}.png"
            image_path = os.path.join(OUTPUT_FOLDER, image_filename)
            counter += 1

        with open(image_path, 'wb') as f:
            f.write(image_bytes.getvalue())

        # Clean up
        os.remove(temp_path)

    except Exception as e:
        print(f"Error processing audio: {e}")
        return jsonify({'error': 'Audio processing failed'}), 500

    # Prepare data for MongoDB
    audio_data = {
        "speakerid": speaker_id,
        "name": data.get("name"),
        "gender": data.get("gender"),
        "age": data.get("age"),
        "country": data.get("country"),
        "speakerId_sequence": speaker_id_sequence,
        "speed": category,
        "text": data.get("text"),
        "validation_status": analysis_results['is_clean'],  # Will be False if drops found
        "update": datetime.now().strftime("%d-%m-%Y-%H:%M:%S"),
        "image_path": image_path,
        "analysis_results": {
            "drops": analysis_results['drops'],
            "drop_count": len(analysis_results['drops']),
            "is_clean": analysis_results['is_clean'],
            "max_sample": analysis_results['max_sample'],
            "min_sample": analysis_results['min_sample'],
            "bit_depth": analysis_results['bit_depth'],
            "sample_rate": analysis_results['sample_rate'],
            "duration": analysis_results['duration']
        }
    }

    # Save to MongoDB
    collection.insert_one(audio_data)
    return jsonify({
        'message': 'Data saved successfully',
        'speakerId_sequence': speaker_id_sequence
    })
@app.route('/api/save-feedback', methods=['POST'])
def save_feedback():
    try:
        data = request.get_json()
        if not data or 'feedback' not in data:
            return jsonify({'error': 'No feedback provided'}), 400

        # Save feedback as JSON file locally
        feedback_dir = 'feedbacks'
        os.makedirs(feedback_dir, exist_ok=True)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        feedback_file = os.path.join(feedback_dir, f'feedback_{timestamp}.json')
        with open(feedback_file, 'w', encoding='utf-8') as f:
            import json
            json.dump(data, f, ensure_ascii=False, indent=2)

        # Optionally: Save to S3 (pseudo, replace with real S3 logic if needed)
        # import boto3
        # s3 = boto3.client('s3')
        # s3.upload_file(feedback_file, 'your-bucket-name', f'feedbacks/feedback_{timestamp}.json')

        return jsonify({'message': 'Feedback saved successfully', 'file': feedback_file}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/checkfails/<speaker_id>', methods=['GET'])
def check_fails(speaker_id):
    try:
        query = {
            "validation_status": False,
            "speakerid": speaker_id
        }

        failed_docs = list(collection.find(query))

        for doc in failed_docs:
            doc['_id'] = str(doc['_id'])  # Convert ObjectId to string

        print(f'Failed docs for speakerid {speaker_id} sent')
        if failed_docs:
            send_email_with_csv (failed_docs, speaker_id)
        return jsonify(failed_docs), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    

def send_email_with_csv(data, speaker_id):
    try:
        # Convert data to DataFrame
        source_data = list(collection.find({"speakerid": speaker_id}, {"_id": 0}))
        df = pd.DataFrame(source_data)

        # Drop unwanted columns
        columns_to_exclude = ['_id', 'analysis_results', 'gender', 'image_path', 'age', 'country']
        df = df.drop(columns=[col for col in columns_to_exclude if col in df.columns])

        # Rename and reorder columns
        rename_map = {
            'name': 'NAME',
            'speakerid': 'SPEAKER_ID',
            'speakerId_sequence': 'S.NO',
            'speed': 'TYPE',
            'update': 'UPDATE',
            'validation_status': 'STATUS'
        }
        df = df.rename(columns=rename_map)
        ordered_columns = ['NAME', 'SPEAKER_ID','S.NO', 'TYPE', 'UPDATE', 'STATUS']
        df = df[ordered_columns]

        # Prepare file path
        output_dir = 'tmp_email'
        os.makedirs(output_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{speaker_id}_Report_{timestamp}.csv"
        csv_path = os.path.join(output_dir, filename)

        # Save CSV file
        df.to_csv(csv_path, index=False)

        # Loop through recipient emails
        for recipient_email in EMAIL_RECIPIENT:
            msg = EmailMessage()
            msg['Subject'] = f'Report for SpeakerID {speaker_id} | Total: {len(source_data)} | Failures: {len(data)}'
            msg['From'] = EMAIL_USER
            msg['To'] = recipient_email
            msg.set_content(
                f"Hi,\n\nPlease find attached the report for speaker ID: {speaker_id}.\n\nRegards,\nSoftware Developer"
            )

            # Attach the CSV file
            with open(csv_path, 'rb') as f:
                msg.add_attachment(f.read(), maintype='application', subtype='octet-stream', filename=filename)

            # Send email via SMTP
            with smtplib.SMTP(EMAIL_SMTP, EMAIL_PORT) as server:
                server.starttls()
                server.login(EMAIL_USER, EMAIL_PASSWORD)
                server.send_message(msg)

            print(f"✅ Email sent to {recipient_email} with CSV attached.")

        # Clean up
        os.remove(csv_path)

    except Exception as e:
        print("❌ Error sending email:", str(e))


if __name__ == '__main__':
    app.run(debug=True, port=7000)