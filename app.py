import streamlit as st
import speech_recognition as sr
import soundfile as sf
import numpy as np
import json
import os
import uuid
import tempfile
import io
import requests
from datetime import datetime
from typing import Dict, List, Tuple, Optional
import re
import base64

# Configure page
st.set_page_config(
    page_title="ITN Audio Processor",
    page_icon="🎤",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Gemini API Configuration - Using Gemini 2.0 Flash Experimental for best audio transcription
GEMINI_API_KEY = "AIzaSyCMpJ1KPJBHPtpJNQLpjgusDo-aPLl0SUQ"
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent"

# Language configurations
LANGUAGES = {
    "en": "English",
    "zh_HK": "Cantonese (Hong Kong)",
    "zh_CN": "Cantonese (Mainland China)",
    "id": "Indonesian",
    "it": "Italian",
    "pl": "Polish",
    "pt_BR": "Portuguese (Brazilian)",
    "pt_PT": "Portuguese (European)",
    "es_ES": "Spanish (European)",
    "es_US": "Spanish (USA)",
    "th": "Thai"
}

# ITN Categories
ITN_CATEGORIES = [
    "NUM", "SERIAL", "PHONE", "CURRENCY", "DATE", "TIME", "UNIT", "URL", "SOCIAL", "ADDRESS"
]

class AudioTranscriber:
    """Handle audio transcription using speech recognition"""
    
    def __init__(self):
        self.recognizer = sr.Recognizer()
    
    def transcribe_audio_file(self, audio_file_path: str, language: str = "en-US") -> str:
        """Enhanced transcribe audio file to text with better error handling"""
        try:
            # Validate file exists
            if not os.path.exists(audio_file_path):
                return "Audio file not found"
            
            # Use speech recognition with better settings
            with sr.AudioFile(audio_file_path) as source:
                # Adjust for noise with optimal duration
                self.recognizer.adjust_for_ambient_noise(source, duration=0.5)
                # Record the entire audio file
                audio = self.recognizer.record(source)
            
            # Map language codes for Google API
            google_lang = self._map_language_code(language)
            
            # Configure recognizer for better accuracy
            self.recognizer.energy_threshold = 300
            self.recognizer.dynamic_energy_threshold = True
            self.recognizer.dynamic_energy_adjustment_damping = 0.15
            self.recognizer.dynamic_energy_ratio = 1.5
            self.recognizer.pause_threshold = 0.8
            self.recognizer.operation_timeout = None
            self.recognizer.phrase_threshold = 0.3
            self.recognizer.non_speaking_duration = 0.5
            
            # Try transcription with Google Speech API
            try:
                text = self.recognizer.recognize_google(
                    audio, 
                    language=google_lang,
                    show_all=False  # Get best result only
                )
                if text and text.strip():
                    return text.strip()
                else:
                    return "Empty transcription result - audio may be unclear"
            except sr.UnknownValueError:
                return "Could not understand the audio - please ensure clear speech and good audio quality"
            except sr.RequestError as e:
                return f"Speech recognition service error: {e}"
            
        except Exception as e:
            return f"Transcription error: {str(e)}"
    
    def _map_language_code(self, language_code: str) -> str:
        """Map internal language codes to Google Speech API codes"""
        mapping = {
            "en": "en-US",
            "zh_HK": "zh-HK", 
            "zh_CN": "zh-CN",
            "id": "id-ID",
            "it": "it-IT",
            "pl": "pl-PL",
            "pt_BR": "pt-BR",
            "pt_PT": "pt-PT",
            "es_ES": "es-ES",
            "es_US": "es-US",
            "th": "th-TH"
        }
        return mapping.get(language_code, "en-US")

class ITNProcessor:
    """Handle ITN processing using Gemini API"""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {'Content-Type': 'application/json'}
    
    def process_itn(self, text: str, language: str = "en") -> Dict:
        """Process text for ITN entities and format"""
        try:
            prompt = f"""
            You are an expert ITN (Inverse Text Normalization) processor. 
            
            Given this transcribed text: "{text}"
            Language: {LANGUAGES.get(language, 'English')}
            
            Please:
            1. Clean and improve the transcription for accuracy
            2. Detect ALL ITN categories present in the text
            3. Format detected entities with ITN tags in the EXACT format: <ITN:CATEGORY>text<ITN:CATEGORY>
            
            ITN Categories to detect:
            - NUM: Numbers (e.g., "one hundred" should become "<ITN:NUM>100<ITN:NUM>")
            - DATE: Dates (e.g., "March 23rd" should become "<ITN:DATE>March 23rd<ITN:DATE>")  
            - TIME: Times (e.g., "three thirty PM" should become "<ITN:TIME>3:30 PM<ITN:TIME>")
            - PHONE: Phone numbers (e.g., "five five five one two three four" should become "<ITN:PHONE>555-1234<ITN:PHONE>")
            - CURRENCY: Money amounts (e.g., "fifty dollars" should become "<ITN:CURRENCY>$50<ITN:CURRENCY>")
            - ADDRESS: Addresses (e.g., "123 Main Street" should become "<ITN:ADDRESS>123 Main Street<ITN:ADDRESS>")
            - SERIAL: Serial numbers/codes
            - UNIT: Measurements (e.g., "five kilograms" should become "<ITN:UNIT>5 kg<ITN:UNIT>")
            - URL: Web addresses
            - SOCIAL: Social media handles/hashtags
            
            IMPORTANT: Use the EXACT format <ITN:CATEGORY>text<ITN:CATEGORY> (with angle brackets)
            
            Return ONLY a valid JSON response in this exact format:
            {{
                "verbatim_transcription": "cleaned original text without ITN tags",
                "itn_transcription": "text with ITN formatting for ALL detected categories using <ITN:CATEGORY>text<ITN:CATEGORY> format",
                "detected_categories": ["list of categories found"],
                "entities_found": ["list of actual entities found"],
                "confidence": "high/medium/low"
            }}
            """
            
            payload = {
                "contents": [{
                    "parts": [{
                        "text": prompt
                    }]
                }],
                "generationConfig": {
                    "temperature": 0.05,  # Very low for consistent ITN processing
                    "topP": 0.9,
                    "topK": 40,
                    "maxOutputTokens": 4096,  # Increased for better processing
                    "candidateCount": 1
                },
                "safetySettings": [
                    {
                        "category": "HARM_CATEGORY_HARASSMENT",
                        "threshold": "BLOCK_NONE"
                    },
                    {
                        "category": "HARM_CATEGORY_HATE_SPEECH",
                        "threshold": "BLOCK_NONE"
                    },
                    {
                        "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        "threshold": "BLOCK_NONE"
                    },
                    {
                        "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                        "threshold": "BLOCK_NONE"
                    }
                ]
            }
            
            response = requests.post(
                f"{GEMINI_API_URL}?key={self.api_key}",
                headers=self.headers,
                json=payload,
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                if 'candidates' in result and len(result['candidates']) > 0:
                    content = result['candidates'][0]['content']['parts'][0]['text']
                    
                    # Clean the response to extract JSON
                    content = content.strip()
                    if content.startswith('```json'):
                        content = content[7:]
                    if content.endswith('```'):
                        content = content[:-3]
                    
                    try:
                        # Find JSON boundaries
                        json_start = content.find('{')
                        json_end = content.rfind('}') + 1
                        if json_start != -1 and json_end != -1:
                            json_content = content[json_start:json_end]
                            parsed_result = json.loads(json_content)
                            
                            # Validate required fields
                            required_fields = ['verbatim_transcription', 'itn_transcription']
                            if all(field in parsed_result for field in required_fields):
                                return parsed_result
                            
                    except json.JSONDecodeError as e:
                        st.warning(f"JSON parsing error: {e}")
                        return self._fallback_processing(text)
                    
                    # Fallback processing if JSON parsing fails
                    return self._fallback_processing(text)
                else:
                    st.warning("No response from Gemini API")
                    return self._fallback_processing(text)
            else:
                st.warning(f"Gemini API error: {response.status_code} - {response.text}")
                return self._fallback_processing(text)
            
        except requests.exceptions.Timeout:
            st.warning("Gemini API timeout - using fallback processing")
            return self._fallback_processing(text)
        except Exception as e:
            st.warning(f"Gemini API error: {str(e)}")
            return self._fallback_processing(text)
    
    def _fallback_processing(self, text: str) -> Dict:
        """Fallback ITN processing when Gemini is unavailable"""
        # Simple regex-based ITN detection
        entities_found = []
        detected_categories = []
        itn_text = text
        
        # Number detection
        number_pattern = r'\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\b'
        numbers_found = re.findall(number_pattern, text, re.IGNORECASE)
        if numbers_found:
            detected_categories.append("NUM")
            entities_found.extend(numbers_found)
            # Simple replacement for numbers (basic example)
            for num in numbers_found:
                itn_text = itn_text.replace(num, f"ITN:NUM{num}ITN:NUM")
        
        # Date detection
        date_pattern = r'\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?\b'
        dates_found = re.findall(date_pattern, text, re.IGNORECASE)
        if dates_found:
            detected_categories.append("DATE")
            entities_found.extend(dates_found)
            for date in dates_found:
                itn_text = itn_text.replace(date, f"ITN:DATE{date}ITN:DATE")
        
        # Time detection
        time_pattern = r'\b(?:\d{1,2}:\d{2}|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:o\'?clock|thirty|fifteen|forty-five)|(?:am|pm|a\.m\.|p\.m\.))\b'
        times_found = re.findall(time_pattern, text, re.IGNORECASE)
        if times_found:
            detected_categories.append("TIME")
            entities_found.extend(times_found)
            for time_val in times_found:
                itn_text = itn_text.replace(time_val, f"ITN:TIME{time_val}ITN:TIME")
        
        return {
            "verbatim_transcription": text,
            "itn_transcription": itn_text,
            "detected_categories": detected_categories,
            "entities_found": entities_found,
            "confidence": "medium"
        }

def save_audio_file(uploaded_file) -> str:
    """Save uploaded audio file to temporary location"""
    try:
        # Create a temporary file
        temp_dir = tempfile.gettempdir()
        temp_filename = f"temp_audio_{uuid.uuid4().hex}.wav"
        temp_path = os.path.join(temp_dir, temp_filename)
        
        # Save the uploaded file
        with open(temp_path, "wb") as f:
            f.write(uploaded_file.read())
        
        return temp_path
    except Exception as e:
        st.error(f"Error saving audio file: {str(e)}")
        return None

def validate_audio_file(file_path: str) -> bool:
    """Validate if the audio file is in correct format"""
    try:
        # Try to read the audio file
        data, sample_rate = sf.read(file_path)
        
        # Check if it's a valid audio file
        if len(data) == 0:
            st.error("Audio file is empty")
            return False
        
        # Check duration (should be reasonable)
        duration = len(data) / sample_rate
        if duration > 300:  # 5 minutes max
            st.warning(f"Audio file is very long ({duration:.1f} seconds). Consider using shorter files.")
        
        st.success(f"✅ Valid audio file: {duration:.1f} seconds, {sample_rate} Hz")
        return True
        
    except Exception as e:
        st.error(f"Invalid audio file: {str(e)}")
        return False

def main():
    """Main Streamlit application"""
    
    st.title("🎤 ITN Audio Processor")
    st.markdown("Upload a .wav file to transcribe and detect ITN entities")
    st.markdown("---")
    
    # Initialize services
    transcriber = AudioTranscriber()
    itn_processor = ITNProcessor(GEMINI_API_KEY)
    
    # Sidebar for settings
    with st.sidebar:
        st.header("⚙️ Settings")
        
        # Language selection
        selected_language = st.selectbox(
            "Select Language", 
            list(LANGUAGES.keys()), 
            format_func=lambda x: LANGUAGES[x]
        )
        
        st.markdown("---")
        
        st.subheader("📋 ITN Categories")
        st.info("The following categories will be automatically detected:")
        for category in ITN_CATEGORIES:
            st.write(f"• **{category}**")
        
        st.markdown("---")
        
        st.subheader("📄 Output Format")
        st.code('''{
  "verbatim_transcription": "original text",
  "itn_transcription": "ITN:CATEGORYtextITN:CATEGORY"
}''', language='json')
    
    # Main content
    col1, col2 = st.columns([2, 1])
    
    with col1:
        st.header("📁 Upload Audio File")
        
        # File uploader
        uploaded_file = st.file_uploader(
            "Choose a .wav file",
            type=['wav'],
            help="Upload a .wav audio file for transcription and ITN processing"
        )
        
        if uploaded_file is not None:
            # Show file details
            file_details = {
                "Filename": uploaded_file.name,
                "File size": f"{uploaded_file.size / 1024:.1f} KB"
            }
            
            st.subheader("📄 File Details")
            for key, value in file_details.items():
                st.write(f"**{key}:** {value}")
            
            # Save and validate the file
            temp_file_path = save_audio_file(uploaded_file)
            
            if temp_file_path and validate_audio_file(temp_file_path):
                
                # Audio player
                st.subheader("🔊 Audio Player")
                st.audio(uploaded_file, format='audio/wav')
                
                # Process button
                if st.button("🚀 Process Audio", type="primary", use_container_width=True):
                    
                    with st.spinner("🎯 Transcribing audio..."):
                        # Step 1: Transcribe audio
                        transcription = transcriber.transcribe_audio_file(temp_file_path, selected_language)
                        
                        if "error" not in transcription.lower():
                            st.success("✅ Transcription completed!")
                            
                            # Show original transcription
                            st.subheader("📝 Original Transcription")
                            st.text_area("", value=transcription, height=100, disabled=True)
                            
                            # Step 2: Process ITN
                            with st.spinner("🔍 Processing ITN entities..."):
                                itn_result = itn_processor.process_itn(transcription, selected_language)
                                
                                # Store results in session state
                                st.session_state.processing_result = {
                                    'original_transcription': transcription,
                                    'itn_result': itn_result,
                                    'file_name': uploaded_file.name,
                                    'language': selected_language,
                                    'timestamp': datetime.now().isoformat()
                                }
                                
                                st.success("✅ ITN processing completed!")
                                st.rerun()
                        else:
                            st.error(f"❌ Transcription failed: {transcription}")
                
                # Clean up temporary file
                try:
                    if os.path.exists(temp_file_path):
                        os.remove(temp_file_path)
                except:
                    pass
        
        # Display results if available
        if 'processing_result' in st.session_state:
            result = st.session_state.processing_result
            itn_data = result['itn_result']
            
            st.markdown("---")
            st.header("🎯 Processing Results")
            
            # Results in tabs
            tab1, tab2, tab3 = st.tabs(["📝 Transcriptions", "🏷️ Detected Entities", "📄 JSON Output"])
            
            with tab1:
                st.subheader("Original Transcription")
                st.text_area("", value=itn_data.get('verbatim_transcription', ''), height=80, disabled=True, key="verbatim_text")
                
                st.subheader("ITN Transcription")
                st.text_area("", value=itn_data.get('itn_transcription', ''), height=80, disabled=True, key="itn_text")
            
            with tab2:
                if itn_data.get('detected_categories'):
                    st.subheader("Detected ITN Categories")
                    for category in itn_data['detected_categories']:
                        st.badge(category)
                    
                    if itn_data.get('entities_found'):
                        st.subheader("Entities Found")
                        for entity in itn_data['entities_found']:
                            st.write(f"• {entity}")
                else:
                    st.info("No ITN entities detected in this audio")
                
                # Confidence level
                confidence = itn_data.get('confidence', 'unknown')
                if confidence == 'high':
                    st.success(f"🎯 Processing Confidence: {confidence.title()}")
                elif confidence == 'medium':
                    st.warning(f"⚠️ Processing Confidence: {confidence.title()}")
                else:
                    st.error(f"❌ Processing Confidence: {confidence.title()}")
            
            with tab3:
                # Generate final JSON output
                final_json = {
                    "verbatim_transcription": itn_data.get('verbatim_transcription', ''),
                    "itn_transcription": itn_data.get('itn_transcription', '')
                }
                
                st.subheader("Final JSON Output")
                json_str = json.dumps(final_json, indent=2, ensure_ascii=False)
                st.code(json_str, language='json')
                
                # Download button
                st.download_button(
                    label="📥 Download JSON",
                    data=json_str,
                    file_name=f"itn_output_{result['file_name'].replace('.wav', '')}.json",
                    mime="application/json",
                    use_container_width=True
                )
    
    with col2:
        st.header("📊 Summary")
        
        if 'processing_result' in st.session_state:
            result = st.session_state.processing_result
            
            # File info
            st.subheader("📁 File Information")
            st.write(f"**File:** {result['file_name']}")
            st.write(f"**Language:** {LANGUAGES[result['language']]}")
            st.write(f"**Processed:** {result['timestamp'][:19]}")
            
            # Statistics
            st.subheader("📈 Statistics")
            transcription = result['itn_result'].get('verbatim_transcription', '')
            word_count = len(transcription.split()) if transcription else 0
            char_count = len(transcription) if transcription else 0
            
            st.metric("Word Count", word_count)
            st.metric("Character Count", char_count)
            
            # Detected categories count
            categories = result['itn_result'].get('detected_categories', [])
            st.metric("ITN Categories", len(categories))
            
            # Processing quality
            confidence = result['itn_result'].get('confidence', 'unknown')
            st.write(f"**Quality:** {confidence.title()}")
            
        else:
            st.info("👆 Upload and process an audio file to see results")
            
            # Example section
            st.subheader("📝 Example")
            st.write("**Input:** Audio saying 'Call me on March 15th at 3 PM'")
            st.code('''{
  "verbatim_transcription": "Call me on March 15th at 3 PM",
  "itn_transcription": "Call me on ITN:DATEMarch 15thITN:DATE at ITN:TIME3 PMITN:TIME"
}''', language='json')
        
        # Clear results button
        if 'processing_result' in st.session_state:
            st.markdown("---")
            if st.button("🗑️ Clear Results", use_container_width=True):
                del st.session_state.processing_result
                st.rerun()
    
    # Footer
    st.markdown("---")
    st.markdown("### 💡 Tips")
    st.info("""
    - Use clear, high-quality .wav files for best results
    - Speak clearly with minimal background noise
    - The tool detects: Numbers, Dates, Times, Phone numbers, Currency, Addresses, Units, URLs, Social handles, and Serial numbers
    - ITN format: ITN:CATEGORYtextITN:CATEGORY
    """)

if __name__ == "__main__":
    main()
