import streamlit as st

# Add error handling for imports
try:
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
except ImportError as e:
    st.error(f"Import error: {e}")
    st.info("Please check that all required packages are installed.")
    st.stop()

# Configure page
st.set_page_config(
    page_title="ITN Audio Processor",
    page_icon="🎤",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Gemini API Configuration - Using Gemini 2.0 Flash Experimental for best audio transcription
GEMINI_API_KEY = "AIzaSyCtJ4cwA90mL25n2f-aFUfnOP0t9zEgs7A"
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
            You are an expert ITN (Inverse Text Normalization) processor following strict formatting conventions.
            
            Given this transcribed text: "{text}"
            Language: {LANGUAGES.get(language, 'English')}
            
            Please:
            1. Clean and improve the transcription for accuracy
            2. Detect ALL ITN categories present in the text
            3. Format detected entities with ITN tags in the EXACT format: <ITN:CATEGORY>text<ITN:CATEGORY>
            
            ITN Categories with SPECIFIC formatting rules:
            
            NUMBERS (NUM):
            - Convert spoken cardinal numbers to digits with US positional notation (commas every third digit from right for numbers >999)
            - Examples: "twelve" -> "12", "three thousand one hundred twenty-seven" -> "3,127", "seventy thousand" -> "70,000"
            - Numbers over one million rounded off: "five million" -> "5 million"
            
            ALPHANUMERICALS (SERIAL):
            - Single continuous string, numbers as digits, letters UPPERCASE by default
            - Include spoken punctuation as characters
            - Example: "A B C one two three dash four" -> "ABC123-4"
            
            PHONE NUMBERS (PHONE):
            - US format: 7/10/11 digits with hyphens (1)-(3)-(3)-(4) structure
            - Examples: "five five five one two three four" -> "555-1234", "one eight hundred five five five one two three four" -> "1-800-555-1234"
            - Word forms: render as UPPERCASE letters with hyphens
            
            CURRENCIES (CURRENCY):
            - Numbers as digits with comma formatting, appropriate currency symbol placement
            - Examples: "fifty dollars" -> "$50", "one thousand five hundred euros" -> "€1,500"
            
            DATES (DATE):
            - Number sequences: digits with hyphens in spoken order
            - Other forms: ordinal days, digit years, comma separation
            - Examples: "March twenty-third nineteen ninety-nine" -> "March 23rd, 1999", "the eighties" -> "the 80s"
            - Truncated years with apostrophe: "ninety-nine" -> "'99"
            
            TIMES (TIME):
            - Digital notation representing spoken time
            - "o'clock" remains written, preceded by digits
            - Examples: "three thirty PM" -> "3:30 PM", "half past two" -> "2:30", "quarter to four" -> "3:45"
            - "five o'clock" -> "5 o'clock"
            
            UNITS OF MEASUREMENT (UNIT):
            - Digits with standard abbreviations, space-separated, no periods
            - Examples: "five kilograms" -> "5 kg", "twenty-five miles per hour" -> "25 mph"
            
            URLS (URL):
            - Spoken punctuation as characters, no added prefixes unless spoken
            - Example: "google dot com" -> "google.com"
            
            SOCIAL MEDIA (SOCIAL):
            - Email: single string with appropriate characters
            - Handles/hashtags: platform conventions
            - Examples: "john at gmail dot com" -> "john@gmail.com", "hashtag trending" -> "#trending"
            
            ADDRESSES (ADDRESS):
            - Street numbers: digit format with commas per Numbers rules
            - Street names: Initial letters capitalized
            - Compass directions: Single capital letters (North -> N, South -> S, East -> E, West -> W)
            - Street types abbreviated: Street -> St, Avenue -> Ave, Boulevard -> Blvd, Road -> Rd, Drive -> Dr
            - Example: "one thousand two hundred thirty-four NORTH MAIN STREET" -> "1,234 N Main St"
            
            IMPORTANT: Use the EXACT format <ITN:CATEGORY>formatted_text<ITN:CATEGORY> (with angle brackets)
            Apply number formatting with commas for all numeric values >999 across all categories.
            
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
        
        # Number detection with US formatting
        number_pattern = r'\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\b'
        numbers_found = re.findall(number_pattern, text, re.IGNORECASE)
        if numbers_found:
            detected_categories.append("NUM")
            for num in numbers_found:
                # Basic number conversion (simplified)
                formatted_num = self._convert_spoken_number(num)
                entities_found.append(formatted_num)
                itn_text = itn_text.replace(num, f"<ITN:NUM>{formatted_num}<ITN:NUM>")
        
        # Phone number detection
        phone_pattern = r'\b(?:(?:one\s+)?(?:eight\s+hundred\s+)?(?:(?:two|three|four|five|six|seven|eight|nine)\s+){2,3}(?:(?:zero|one|two|three|four|five|six|seven|eight|nine)\s+){4,7})\b'
        phone_matches = re.findall(phone_pattern, text, re.IGNORECASE)
        if phone_matches:
            detected_categories.append("PHONE")
            for phone in phone_matches:
                formatted_phone = self._format_phone_number(phone)
                entities_found.append(formatted_phone)
                itn_text = itn_text.replace(phone, f"<ITN:PHONE>{formatted_phone}<ITN:PHONE>")
        
        # Currency detection
        currency_pattern = r'\b(?:(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\s+)+(?:dollars?|euros?|pounds?|cents?|yen)\b'
        currency_found = re.findall(currency_pattern, text, re.IGNORECASE)
        if currency_found:
            detected_categories.append("CURRENCY")
            for currency in currency_found:
                formatted_currency = self._format_currency(currency)
                entities_found.append(formatted_currency)
                itn_text = itn_text.replace(currency, f"<ITN:CURRENCY>{formatted_currency}<ITN:CURRENCY>")
        
        # Address detection with enhanced formatting
        address_pattern = r'\b\d+\s+(?:(?:north|south|east|west)\s+)?[a-zA-Z\s]+(?:street|avenue|boulevard|road|drive|st|ave|blvd|rd|dr)\b'
        addresses_found = re.findall(address_pattern, text, re.IGNORECASE)
        if addresses_found:
            detected_categories.append("ADDRESS")
            for address in addresses_found:
                formatted_address = self._format_address(address)
                entities_found.append(formatted_address)
                itn_text = itn_text.replace(address, f"<ITN:ADDRESS>{formatted_address}<ITN:ADDRESS>")
        
        # Date detection
        date_pattern = r'\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?\b|\b(?:the\s+)?(?:eighties|nineties|sixties|seventies|fifties)\b'
        dates_found = re.findall(date_pattern, text, re.IGNORECASE)
        if dates_found:
            detected_categories.append("DATE")
            for date in dates_found:
                formatted_date = self._format_date(date)
                entities_found.append(formatted_date)
                itn_text = itn_text.replace(date, f"<ITN:DATE>{formatted_date}<ITN:DATE>")
        
        # Time detection
        time_pattern = r'\b(?:\d{1,2}:\d{2}|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:o\'?clock|thirty|fifteen|forty-five|quarter\s+(?:to|past)|half\s+past)|(?:am|pm|a\.m\.|p\.m\.))\b'
        times_found = re.findall(time_pattern, text, re.IGNORECASE)
        if times_found:
            detected_categories.append("TIME")
            for time_val in times_found:
                formatted_time = self._format_time(time_val)
                entities_found.append(formatted_time)
                itn_text = itn_text.replace(time_val, f"<ITN:TIME>{formatted_time}<ITN:TIME>")
        
        # Unit detection
        unit_pattern = r'\b(?:(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\s+)+(?:kilograms?|pounds?|ounces?|grams?|miles?|kilometers?|feet|inches?|meters?|yards?|mph|kph)\b'
        units_found = re.findall(unit_pattern, text, re.IGNORECASE)
        if units_found:
            detected_categories.append("UNIT")
            for unit in units_found:
                formatted_unit = self._format_unit(unit)
                entities_found.append(formatted_unit)
                itn_text = itn_text.replace(unit, f"<ITN:UNIT>{formatted_unit}<ITN:UNIT>")
        
        # Email/Social detection
        email_pattern = r'\b[a-zA-Z0-9]+\s+at\s+[a-zA-Z0-9]+\s+dot\s+[a-zA-Z]{2,}\b|\bhashtag\s+[a-zA-Z0-9]+\b'
        social_found = re.findall(email_pattern, text, re.IGNORECASE)
        if social_found:
            detected_categories.append("SOCIAL")
            for social in social_found:
                formatted_social = self._format_social(social)
                entities_found.append(formatted_social)
                itn_text = itn_text.replace(social, f"<ITN:SOCIAL>{formatted_social}<ITN:SOCIAL>")
        
        # URL detection
        url_pattern = r'\b[a-zA-Z0-9]+\s+dot\s+(?:com|org|net|edu|gov)\b'
        urls_found = re.findall(url_pattern, text, re.IGNORECASE)
        if urls_found:
            detected_categories.append("URL")
            for url in urls_found:
                formatted_url = self._format_url(url)
                entities_found.append(formatted_url)
                itn_text = itn_text.replace(url, f"<ITN:URL>{formatted_url}<ITN:URL>")
        
        # Serial number detection
        serial_pattern = r'\b[a-zA-Z]+\s*\d+[a-zA-Z\d\s\-]*\b'
        serials_found = re.findall(serial_pattern, text, re.IGNORECASE)
        if serials_found:
            detected_categories.append("SERIAL")
            for serial in serials_found:
                formatted_serial = self._format_serial(serial)
                entities_found.append(formatted_serial)
                itn_text = itn_text.replace(serial, f"<ITN:SERIAL>{formatted_serial}<ITN:SERIAL>")
        
        return {
            "verbatim_transcription": text,
            "itn_transcription": itn_text,
            "detected_categories": detected_categories,
            "entities_found": entities_found,
            "confidence": "medium"
        }
    
    def _format_address(self, address: str) -> str:
        """Format address according to specific rules"""
        # Convert to proper case first
        formatted = address.strip()
        
        # Street type abbreviations
        street_abbrev = {
            'street': 'St',
            'avenue': 'Ave', 
            'boulevard': 'Blvd',
            'road': 'Rd',
            'drive': 'Dr'
        }
        
        # Direction formatting (single letters only)
        directions = {
            'north': 'N',
            'south': 'S', 
            'east': 'E',
            'west': 'W'
        }
        
        # Apply street abbreviations
        for full_word, abbrev in street_abbrev.items():
            # Case insensitive replacement
            pattern = re.compile(re.escape(full_word), re.IGNORECASE)
            formatted = pattern.sub(abbrev, formatted)
        
        # Apply direction formatting
        for direction_lower, direction_proper in directions.items():
            # Case insensitive replacement for whole words
            pattern = re.compile(r'\b' + re.escape(direction_lower) + r'\b', re.IGNORECASE)
            formatted = pattern.sub(direction_proper, formatted)
        
        # Capitalize street names properly
        words = formatted.split()
        for i, word in enumerate(words):
            if word not in ['N', 'S', 'E', 'W', 'St', 'Ave', 'Blvd', 'Rd', 'Dr'] and not word.isdigit():
                words[i] = word.capitalize()
        
        return ' '.join(words)
    
    def _convert_spoken_number(self, spoken_num: str) -> str:
        """Convert spoken numbers to digits with US formatting"""
        # Basic number word to digit mapping (simplified)
        number_map = {
            'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
            'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
            'ten': '10', 'eleven': '11', 'twelve': '12', 'thirteen': '13',
            'fourteen': '14', 'fifteen': '15', 'sixteen': '16', 'seventeen': '17',
            'eighteen': '18', 'nineteen': '19', 'twenty': '20', 'thirty': '30',
            'forty': '40', 'fifty': '50', 'sixty': '60', 'seventy': '70',
            'eighty': '80', 'ninety': '90', 'hundred': '100', 'thousand': '1000',
            'million': '1000000', 'billion': '1000000000'
        }
        
        lower_num = spoken_num.lower()
        if lower_num in number_map:
            num = int(number_map[lower_num])
            # Add commas for numbers > 999
            if num > 999:
                return f"{num:,}"
            return str(num)
        return spoken_num
    
    def _format_phone_number(self, phone_text: str) -> str:
        """Format phone numbers according to US standard"""
        # Extract digits from spoken phone number (simplified)
        # This is a basic implementation
        return phone_text  # Return as-is for now, would need complex parsing
    
    def _format_currency(self, currency_text: str) -> str:
        """Format currency with appropriate symbols"""
        # Basic currency formatting (simplified)
        if 'dollar' in currency_text.lower():
            return f"${currency_text}"  # Would need proper number conversion
        elif 'euro' in currency_text.lower():
            return f"€{currency_text}"
        elif 'pound' in currency_text.lower():
            return f"£{currency_text}"
        return currency_text
    
    def _format_date(self, date_text: str) -> str:
        """Format dates according to specified rules"""
        # Handle decades
        if 'eighties' in date_text.lower():
            return 'the 80s'
        elif 'nineties' in date_text.lower():
            return 'the 90s'
        elif 'seventies' in date_text.lower():
            return 'the 70s'
        elif 'sixties' in date_text.lower():
            return 'the 60s'
        elif 'fifties' in date_text.lower():
            return 'the 50s'
        
        # For other dates, return as-is (would need complex parsing for full implementation)
        return date_text
    
    def _format_time(self, time_text: str) -> str:
        """Format times in digital notation"""
        # Handle common time expressions
        time_lower = time_text.lower()
        if 'half past' in time_lower:
            # Extract hour and format as :30
            return time_text  # Simplified
        elif 'quarter to' in time_lower:
            # Format as :45 of previous hour
            return time_text  # Simplified
        elif 'quarter past' in time_lower:
            # Format as :15
            return time_text  # Simplified
        elif "o'clock" in time_lower:
            # Keep o'clock format but convert number to digit
            return time_text  # Simplified
        
        return time_text
    
    def _format_unit(self, unit_text: str) -> str:
        """Format units of measurement"""
        # Convert spoken numbers and abbreviate units
        unit_abbrev = {
            'kilograms': 'kg', 'kilogram': 'kg',
            'pounds': 'lbs', 'pound': 'lb',
            'ounces': 'oz', 'ounce': 'oz',
            'grams': 'g', 'gram': 'g',
            'miles': 'mi', 'mile': 'mi',
            'kilometers': 'km', 'kilometer': 'km',
            'feet': 'ft', 'foot': 'ft',
            'inches': 'in', 'inch': 'in',
            'meters': 'm', 'meter': 'm',
            'yards': 'yd', 'yard': 'yd',
            'miles per hour': 'mph',
            'kilometers per hour': 'kph'
        }
        
        formatted = unit_text.lower()
        for full_unit, abbrev in unit_abbrev.items():
            if full_unit in formatted:
                formatted = formatted.replace(full_unit, abbrev)
        
        return formatted
    
    def _format_social(self, social_text: str) -> str:
        """Format social media handles and email addresses"""
        social_lower = social_text.lower()
        if 'at' in social_lower and 'dot' in social_lower:
            # Email format: "john at gmail dot com" -> "john@gmail.com"
            formatted = social_lower.replace(' at ', '@').replace(' dot ', '.')
            return formatted
        elif 'hashtag' in social_lower:
            # Hashtag format: "hashtag trending" -> "#trending"
            formatted = social_lower.replace('hashtag ', '#')
            return formatted
        
        return social_text
    
    def _format_url(self, url_text: str) -> str:
        """Format URLs"""
        # "google dot com" -> "google.com"
        formatted = url_text.lower().replace(' dot ', '.')
        return formatted
    
    def _format_serial(self, serial_text: str) -> str:
        """Format serial numbers/alphanumericals"""
        # Convert to uppercase and remove extra spaces
        formatted = serial_text.upper().replace(' ', '')
        return formatted

def save_audio_file(uploaded_file) -> str:
    """Save uploaded audio file to temporary location"""
    try:
        # Use Streamlit's native temporary file handling
        temp_filename = f"temp_audio_{uuid.uuid4().hex}.wav"
        temp_path = os.path.join(tempfile.gettempdir(), temp_filename)
        
        # Reset file pointer to beginning
        uploaded_file.seek(0)
        
        # Save the uploaded file
        with open(temp_path, "wb") as f:
            f.write(uploaded_file.read())
        
        # Reset file pointer again for future use
        uploaded_file.seek(0)
        
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
  "itn_transcription": "<ITN:CATEGORY>text<ITN:CATEGORY>"
}''', language='json')
        
        st.subheader("📍 ITN Formatting Rules")
        st.info("""
**Numbers:** US format with commas (1,000; 5 million)

**Phone:** US format with hyphens (555-1234; 1-800-555-1234)

**Currency:** Symbol + digits ($50; €1,500)

**Dates:** Ordinal days, digit years (March 23rd, 1999; the 80s)

**Times:** Digital notation (3:30 PM; 5 o'clock; 2:30 for "half past two")

**Units:** Digits + abbreviations (5 kg; 25 mph)

**Addresses:** Numbers with commas, directions as letters (1,234 N Main St)

**URLs:** Spoken punctuation as characters (google.com)

**Social:** Platform conventions (john@gmail.com; #trending)

**Serial:** Uppercase, continuous string (ABC123-4)
""")
    
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
                            st.text_area("Original Transcription", value=transcription, height=100, disabled=True, label_visibility="collapsed")
                            
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
                st.text_area("Verbatim Transcription", value=itn_data.get('verbatim_transcription', ''), height=80, disabled=True, key="verbatim_text", label_visibility="collapsed")
                
                st.subheader("ITN Transcription")
                st.text_area("ITN Formatted Transcription", value=itn_data.get('itn_transcription', ''), height=80, disabled=True, key="itn_text", label_visibility="collapsed")
            
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
            st.subheader("📝 ITN Examples")
            
            st.write("**Numbers:** 'one thousand five hundred' → '1,500'")
            st.write("**Phone:** 'five five five one two three four' → '555-1234'")
            st.write("**Currency:** 'fifty dollars' → '$50'")
            st.write("**Date:** 'March twenty-third' → 'March 23rd'")
            st.write("**Time:** 'half past two PM' → '2:30 PM'")
            st.write("**Unit:** 'five kilograms' → '5 kg'")
            st.write("**Address:** 'one thousand N Main Street' → '1,000 N Main St'")
            st.write("**Email:** 'john at gmail dot com' → 'john@gmail.com'")
            st.write("**URL:** 'google dot com' → 'google.com'")
            
            st.code('''{
  "verbatim_transcription": "Call me on March 15th at 3 PM",
  "itn_transcription": "Call me on <ITN:DATE>March 15th<ITN:DATE> at <ITN:TIME>3:00 PM<ITN:TIME>"
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
    - Comprehensive ITN detection with US formatting conventions
    - Numbers: Comma-separated digits (1,000; 5 million for rounded millions)
    - Phone: US format with hyphens (555-1234; 1-800-555-1234)
    - Currency: Symbol placement per convention ($50; €1,500)
    - Dates: Ordinal days, digit years (March 23rd, 1999; the 80s)
    - Times: Digital notation (3:30 PM; 5 o'clock; 2:30 for "half past two")
    - Units: Digits + standard abbreviations (5 kg; 25 mph)
    - Addresses: Comma-formatted numbers, single-letter directions (1,234 N Main St)
    - Serials: Uppercase continuous strings (ABC123-4)
    - URLs: Spoken punctuation as characters (google.com)
    - Social: Platform conventions (john@gmail.com; #trending)
    """)

if __name__ == "__main__":
    main()
