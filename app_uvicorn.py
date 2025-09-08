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
from quart import Quart, request, jsonify
from quart_cors import cors
import threading
import boto3
from botocore.exceptions import NoCredentialsError, ClientError

app = Quart(__name__)
app = cors(app, allow_origin="*")  # Replace Flask-CORS with Quart-CORS

# Load variables from .env file
load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URI")
EMAIL_USER = os.getenv('EMAIL_USER')
EMAIL_PASSWORD = os.getenv('EMAIL_PASSWORD')
EMAIL_SMTP = os.getenv("EMAIL_SMTP")
EMAIL_PORT = os.getenv("EMAIL_PORT")
emails = os.getenv("RECIPIENT_EMAIL", "")
cc_emails = os.getenv("CC_EMAIL", "")

# AWS S3 Configuration
AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID')
AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
AWS_REGION = os.getenv('AWS_REGION', 'us-east-1')
S3_BUCKET_NAME = 'audio-sourcing-itn'

# Initialize S3 client
s3_client = boto3.client(
    's3',
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=AWS_REGION
)

EMAIL_RECIPIENT = [email.strip() for email in emails.split(",") if email.strip()]

# MongoDB setup
client = MongoClient(MONGODB_URL)
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

def get_next_itn_sequence(locale):
    """
    Get the next sequence number for ITN files based on existing files in S3
    Format: audio_countrycode_ITN_sequence (e.g., audio_zh_HK_ITN_0001)
    """
    try:
        # List objects in both original and modified folders
        prefix_original = f"original/audio_{locale}_ITN_"
        prefix_modified = f"modified/audio_{locale}_ITN_"
        
        existing_numbers = set()
        
        # Check original folder
        response = s3_client.list_objects_v2(
            Bucket=S3_BUCKET_NAME,
            Prefix=prefix_original
        )
        
        if 'Contents' in response:
            for obj in response['Contents']:
                key = obj['Key']
                # Extract sequence number from filename
                match = re.search(r'audio_' + re.escape(locale) + r'_ITN_(\d{4})\.', key)
                if match:
                    existing_numbers.add(int(match.group(1)))
        
        # Check modified folder
        response = s3_client.list_objects_v2(
            Bucket=S3_BUCKET_NAME,
            Prefix=prefix_modified
        )
        
        if 'Contents' in response:
            for obj in response['Contents']:
                key = obj['Key']
                # Extract sequence number from filename
                match = re.search(r'audio_' + re.escape(locale) + r'_ITN_(\d{4})\.', key)
                if match:
                    existing_numbers.add(int(match.group(1)))
        
        # Find next available number
        next_number = 1
        while next_number in existing_numbers:
            next_number += 1
            
        return f"{next_number:04d}"
        
    except Exception as e:
        print(f"Error getting ITN sequence: {e}")
        # Fallback to timestamp-based sequence
        return datetime.now().strftime("%H%M")

def upload_to_s3(file_path, s3_key, metadata=None):
    """
    Upload a file to S3 bucket
    """
    try:
        extra_args = {}
        if metadata:
            extra_args['Metadata'] = metadata
            
        s3_client.upload_file(
            file_path,
            S3_BUCKET_NAME,
            s3_key,
            ExtraArgs=extra_args
        )
        
        return f"s3://{S3_BUCKET_NAME}/{s3_key}"
        
    except FileNotFoundError:
        print(f"File {file_path} not found")
        return None
    except NoCredentialsError:
        print("AWS credentials not available")
        return None
    except Exception as e:
        print(f"Error uploading to S3: {e}")
        return None

def upload_json_to_s3(json_data, s3_key):
    """
    Upload JSON data directly to S3
    """
    try:
        import json
        json_str = json.dumps(json_data, indent=2, default=str)
        
        s3_client.put_object(
            Bucket=S3_BUCKET_NAME,
            Key=s3_key,
            Body=json_str,
            ContentType='application/json'
        )
        
        return f"s3://{S3_BUCKET_NAME}/{s3_key}"
        
    except Exception as e:
        print(f"Error uploading JSON to S3: {e}")
        return None

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
async def save_audio():
    try:
        print('save_audio request---> Request')

        # Parse JSON data
        try:
            data = await request.get_json()
        except Exception as e:
            print(f"Error parsing JSON: {e}")
            return jsonify({'error': 'Invalid JSON data'}), 400

        if not data:
            return jsonify({'error': 'Invalid data'}), 400

        data_uri = data.get("dataURI")
        if not data_uri:
            print(f"No audio data found in keys: {list(data.keys())}")
            return jsonify({'error': 'No audio data received'}), 400

        # Decode and save temp audio file
        header, encoded = data_uri.split(",", 1)
        audio_bytes = base64.b64decode(encoded)
        temp_filename = f"{uuid.uuid4()}.wav"
        temp_path = os.path.join(tempfile.gettempdir(), temp_filename)

        with open(temp_path, "wb") as f:
            f.write(audio_bytes)

        # Analyze the audio
        analysis_results = analyze_audio(temp_path)
        if analysis_results.get('status') == 'error':
            return jsonify({'error': analysis_results['message']}), 400

        # Generate image from analysis
        image_bytes = generate_analysis_image(temp_path, analysis_results.get('drops'))
        if not image_bytes:
            return jsonify({'error': 'Failed to generate analysis image'}), 500

        # Save image file
        speaker_id_sequence = data.get("speakerId_sequence", "unknown")
        image_filename = f"{speaker_id_sequence}.png"
        image_path = os.path.join(OUTPUT_FOLDER, image_filename)

        counter = 1
        while os.path.exists(image_path):
            image_filename = f"{speaker_id_sequence}_{counter}.png"
            image_path = os.path.join(OUTPUT_FOLDER, image_filename)
            counter += 1

        with open(image_path, 'wb') as f:
            f.write(image_bytes.getvalue())

        # Delete temporary audio file
        os.remove(temp_path)

        # Prepare data for MongoDB
        audio_data = {
            "speakerid": data.get("speakerId"),
            "name": data.get("name"),
            "gender": data.get("gender"),
            "age": data.get("age"),
            "country": data.get("country"),
            "speakerId_sequence": speaker_id_sequence,
            "speed": data.get("speed"),
            "text": data.get("text"),
            "validation_status": analysis_results['is_clean'],
            "update": datetime.now().strftime("%d-%m-%Y-%H:%M:%S"),
            "image_path": image_path,
            "re_record":0,
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

        # Insert into MongoDB
        result = collection.insert_one(audio_data)
        print('Data Successfully Added')
        return jsonify({'message': 'Data saved successfully'})

    except Exception as e:
        print(f"Unexpected error in save_audio: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/resave_audio', methods=['POST'])
async def resave_audio():
    print('resave_audio request---> Request')
    try:
        # Use await to properly get the JSON data
        data = await request.get_json()
    except Exception as e:
        print(f"Error parsing JSON: {e}")
        return jsonify({'error': 'Invalid JSON data'}), 400

    if not data:
        return jsonify({'error': 'Invalid data'}), 400

    data_uri = data.get("dataURI")
    if not data_uri:
        print(f"No audio data found in keys: {list(data.keys())}")
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

        # Save image with speakerId_sequence as filename
        speaker_id_sequence = data.get("speakerId_sequence", "unknown")
        image_filename = f"{speaker_id_sequence}.png"
        image_path = os.path.join(OUTPUT_FOLDER, image_filename)
        
        # Handle duplicate filenames
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

    try:
        # Build the audio data dictionary without re_record
        audio_data = {
            "speakerid": data.get("speakerId"),
            "name": data.get("name"),
            "gender": data.get("gender"),
            "age": data.get("age"),
            "country": data.get("country"),
            "speakerId_sequence": speaker_id_sequence,
            "speed": data.get("speed"),
            "text": data.get("text"),
            "validation_status": analysis_results['is_clean'],
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

        # Check if document exists
        existing_doc = collection.find_one({
            "speakerId_sequence": speaker_id_sequence,
            "speakerid": data.get("speakerId"),
            "name": data.get("name"),
        })

        if existing_doc:
            # Always increment re_record by 1
            update_query = {
                "$set": audio_data,
                "$inc": {"re_record": 1}
            }

            collection.update_one(
                {
                    "speakerId_sequence": speaker_id_sequence,
                    "speakerid": data.get("speakerId"),
                    "name": data.get("name"),
                },
                update_query
            )

            print('Data updated successfully')
            return jsonify({'message': 'Data updated successfully'})
        else:
            print('No matching document found to update')
            return jsonify({'message': 'No matching document found'}), 404

    except Exception as e:
        print(f'Error updating data: {e}')
        return jsonify({'error': 'Failed to update data', 'details': str(e)}), 500
    

@app.route('/checkfails/<speaker_id>/<country>', methods=['GET'])
async def check_fails(speaker_id, country):
    try:
        print('checkfails_sendemails--->Request')
        query = {
            "validation_status": False,
            "speakerid": speaker_id,
            "country": country
        }
        queryed = {
            "speakerid": speaker_id,
            "country": country
        }

        failed_docs = list(collection.find(query))
        # full_Docs means all the documents for the speaker_id like false and true, email based on full_Docs-->Dev-L
        full_Docs = list(collection.find(queryed))

        for doc in failed_docs:
            doc['_id'] = str(doc['_id'])  # Convert ObjectId to string

        print(f'Failed docs for speakerid {speaker_id} sent')

        # Check if any document has re_record >= 1
        if any(doc.get('re_record', 0) >= 1 for doc in full_Docs):
            email_thread = threading.Thread(
                target=send_email_with_csv,
                args=(failed_docs, speaker_id,country)
            )
            email_thread.daemon = True
            email_thread.start()

        return jsonify(failed_docs), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/checkdata/<format_id>/<country>', methods=['GET'])
async def check_data(format_id, country):
    try:
        print('checkdata----> Request')
        query = {
            "validation_status": False,
            "speakerid": format_id,
            "country": country
        }
        data = list(collection.find(query))
        for doc in data:
            doc['_id'] = str(doc['_id'])  # Convert ObjectId to string
        return jsonify(data), 200
    except Exception as e:
        print("Error in checkdata:", str(e))
        return jsonify({"error": str(e)}), 500


def send_email_with_csv(data, speaker_id,country):
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
            're_record':"RE-RECORD",
            'update': 'UPDATE',
            'validation_status': 'STATUS'
        }
        df = df.rename(columns=rename_map)
        ordered_columns = ['NAME', 'SPEAKER_ID','S.NO', 'TYPE','RE-RECORD','UPDATE', 'STATUS']
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
            msg['From'] = 'no-reply@develop-team'
            msg['To'] = recipient_email
            msg['Cc'] = cc_emails
            if len(data) > 0:
                msg['Subject'] = f'Failures:Audio Validation Report for SpeakerID {speaker_id}'
                msg.set_content(
                f"Hi,\n\nPlease find attached the report for speaker ID: {speaker_id}.\n\n| Total: {len(source_data)} | Failures: {len(data)}\n\nKindly if need to re-recourd use this Link https://audio-sourcing.objectways.com/re-record/{speaker_id}/{country} \n\nRegards,\nSoftware Developer"
                 )
            else:
                msg['Subject'] = f'SUCCESS: Audio Validation -> Speaker ID {speaker_id}'
                msg.set_content(f"Hi,Thank You!\n\nWe’re pleased to inform you that the task for Speaker ID {speaker_id} has been successfully completed..\n\nPlease find attached the report for speaker ID: {speaker_id}.\n\n| Total: {len(source_data)} | Failures: {len(data)}\n\n\n\nRegards,\nSoftware Developer")


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
        # os.remove(csv_path)

    except Exception as e:
        print("❌ Error sending email:", str(e))


@app.route('/api/submit-medical-audio', methods=['POST'])
async def submit_medical_audio():
    """
    Handle medical audio submissions with S3 storage and frequency conversion
    """
    try:
        print('Medical audio submission request received')
        
        # Get form data
        form = await request.form
        files = await request.files
        
        # Validate required fields (updated to remove speakerCode and ageGroup, add frequency)
        required_fields = ['speakerId', 'speakerName', 'speakerGender', 'speakerAge', 
                          'locale', 'deviceType', 'frequency', 'sentenceId', 'sentenceText']
        
        for field in required_fields:
            if field not in form:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        if 'audio' not in files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = files['audio']
        if audio_file.filename == '':
            return jsonify({'error': 'No audio file selected'}), 400
        
        # Generate unique identifier
        submission_id = str(uuid.uuid4())[:8]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Extract form data
        speaker_id = form['speakerId']
        locale = form['locale']
        target_frequency = int(form['frequency'])  # Use frequency instead of targetFrequency
        sentence_id = form['sentenceId']
        device_type = form['deviceType']
        
        # Generate ITN sequence number
        itn_sequence = get_next_itn_sequence(locale)
        
        # Generate filenames using new convention: audio_countrycode_ITN_sequence
        base_filename = f"audio_{locale}_ITN_{itn_sequence}"
        original_filename = f"{base_filename}.wav"
        converted_filename = f"{base_filename}.wav"
        json_filename = f"metadata_{locale}_ITN_{itn_sequence}.json"
        
        # Save temporary audio file
        temp_filename = f"{base_filename}_{timestamp}.wav"
        temp_path = os.path.join(tempfile.gettempdir(), temp_filename)
        
        # Save uploaded file
        audio_content = await audio_file.read()
        with open(temp_path, 'wb') as f:
            f.write(audio_content)
        
        # Analyze original audio
        analysis_results = analyze_audio(temp_path)
        if analysis_results.get('status') == 'error':
            os.remove(temp_path)
            return jsonify({'error': f'Audio analysis failed: {analysis_results["message"]}'}), 400
        
        # Generate analysis image
        image_bytes = generate_analysis_image(temp_path, analysis_results.get('drops'))
        
        # Create metadata JSON
        metadata = {
            'submission_id': submission_id,
            'timestamp': timestamp,
            'speaker_info': {
                'speaker_id': speaker_id,
                'name': form['speakerName'],
                'gender': form['speakerGender'],
                'age': int(form['speakerAge']),
                'locale': locale,
                'device_type': device_type
            },
            'audio_info': {
                'sentence_id': sentence_id,
                'sentence_text': form['sentenceText'],
                'original_frequency': analysis_results['sample_rate'],
                'target_frequency': target_frequency,
                'duration': analysis_results['duration'],
                'bit_depth': analysis_results['bit_depth'],
                'itn_sequence': itn_sequence
            },
            'analysis_results': analysis_results,
            'file_paths': {
                'original_audio': f"original/{original_filename}",
                'modified_audio': f"modified/{converted_filename}",
                'metadata': f"original/{json_filename}"
            }
        }
        
        # Convert audio frequency if needed
        converted_path = temp_path
        if analysis_results['sample_rate'] != target_frequency:
            converted_path = os.path.join(tempfile.gettempdir(), f"converted_{temp_filename}")
            
            # Load and resample audio
            audio, sr = sf.read(temp_path)
            if len(audio.shape) > 1:
                audio = audio[:, 0]  # Convert to mono
            
            # Resample audio
            audio_resampled = librosa.resample(audio, orig_sr=sr, target_sr=target_frequency)
            
            # Save converted audio
            sf.write(converted_path, audio_resampled, target_frequency)
        
        # Upload to S3 bucket: audio-sourcing-itn
        s3_paths = {}
        
        # Upload original audio to S3 original folder
        original_s3_key = f"original/{original_filename}"
        s3_paths['original_audio'] = upload_to_s3(temp_path, original_s3_key, {
            'speaker-id': speaker_id,
            'locale': locale,
            'itn-sequence': itn_sequence,
            'submission-id': submission_id
        })
        
        # Upload modified audio to S3 modified folder
        modified_s3_key = f"modified/{converted_filename}"
        s3_paths['modified_audio'] = upload_to_s3(converted_path, modified_s3_key, {
            'speaker-id': speaker_id,
            'locale': locale,
            'itn-sequence': itn_sequence,
            'submission-id': submission_id,
            'frequency': str(target_frequency)
        })
        
        # Upload metadata to S3 original folder
        metadata_s3_key = f"original/{json_filename}"
        s3_paths['metadata'] = upload_json_to_s3(metadata, metadata_s3_key)
        
        # Update metadata with actual S3 paths
        metadata['file_paths'] = {
            'original_audio': s3_paths['original_audio'],
            'modified_audio': s3_paths['modified_audio'],
            'metadata': s3_paths['metadata']
        }
        
        # Store in MongoDB for tracking
        db_record = {
            'submission_id': submission_id,
            'speaker_id': speaker_id,
            'speaker_name': form['speakerName'],
            'speaker_gender': form['speakerGender'],
            'speaker_age': int(form['speakerAge']),
            'locale': locale,
            'sentence_id': sentence_id,
            'device_type': device_type,
            'target_frequency': target_frequency,
            'itn_sequence': itn_sequence,
            'validation_status': analysis_results['is_clean'],
            'timestamp': datetime.now(),
            'file_paths': metadata['file_paths'],
            'analysis_results': analysis_results,
            'metadata': metadata
        }
        
        # Insert into MongoDB
        try:
            result = collection.insert_one(db_record)
            print(f'Medical audio submission stored in MongoDB: {result.inserted_id}')
        except Exception as e:
            print(f'MongoDB insertion failed: {e}')
        
        # Clean up temporary files
        os.remove(temp_path)
        if converted_path != temp_path:
            os.remove(converted_path)
        
        print(f'Medical audio submission processed successfully: {submission_id}')
        
        return jsonify({
            'message': 'Audio submitted successfully',
            'submission_id': submission_id,
            'validation_status': analysis_results['is_clean'],
            'file_paths': metadata['file_paths'],
            'analysis_summary': {
                'is_clean': analysis_results['is_clean'],
                'drops_detected': len(analysis_results['drops']),
                'duration': analysis_results['duration'],
                'sample_rate': analysis_results['sample_rate']
            }
        })
        
    except Exception as e:
        print(f"Error in medical audio submission: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Internal server error', 'details': str(e)}), 500


@app.route('/medical-asr')
async def medical_asr_interface():
    """
    Serve the medical ASR interface
    """
    try:
        # For Quart, we need to use render_template differently
        from quart import render_template
        return await render_template('medical-asr.pug')
    except Exception as e:
        print(f"Error serving medical ASR interface: {e}")
        return f"Error loading interface: {str(e)}", 500


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7000)