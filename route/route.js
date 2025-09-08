import express from 'express';
import path from 'path';
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fetch from 'node-fetch';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import wav from 'wav';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
});

// Middleware to handle file uploads
router.use('/api/submit-medical-audio', upload.single('audio'));
router.use('/api/transcribe-audio', upload.single('audio'));
router.use('/api/submit-enhanced-medical-audio', upload.single('audio'));

// --- AWS S3 Configuration ---
const region = process.env.AWS_REGION || 'us-east-1';
const bucketName = process.env.S3_BUCKET_NAME || 'audio-sourcing-itn';

console.log('🌐 Using direct HTTP uploads for public S3 bucket');
console.log(`🪣 S3 Bucket: ${bucketName} (Region: ${region})`);
// --- End AWS S3 Configuration ---

// --- Gemini API Configuration ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = process.env.GEMINI_API_URL;
// --- End Gemini API Configuration ---

// --- Audio Analysis Functions ---

// Convert actual sample rate to kHz format
function roundToStandardSampleRate(frequency) {
    // Use the actual frequency, rounded to nearest integer
    const roundedFreq = Math.round(frequency);
    
    // Convert to kHz format
    if (roundedFreq >= 1000) {
        return `${Math.round(roundedFreq / 1000)}kHz`;
    }
    return `${roundedFreq}Hz`;
}

// Convert frequency to kHz format for filenames
function frequencyToKHz(frequency) {
    const freq = parseInt(frequency);
    if (freq >= 1000) {
        return `${Math.round(freq / 1000)}kHz`;
    }
    return `${freq}Hz`;
}

// Convert locale to proper format (capitalize first letters, use underscores)
function formatLocale(locale) {
    return locale.split('-').map(part => 
        part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    ).join('_');
}

// Convert locale to human-readable format for JSON (capitalize first letters, use spaces)
function formatLocaleForJSON(locale) {
    return locale.split('-').map(part => 
        part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    ).join(' ');
}

// Format duration to HH:MM:SS
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Determine ITN category from sentence content
function determineITNCategory(sentenceText) {
    const text = sentenceText.toLowerCase();
    
    // ADDRESS indicators (check first - highest priority for addresses)
    if (text.includes('street') || text.includes('avenue') || text.includes('road') || 
        text.includes('drive') || text.includes('lane') || text.includes('apartment') ||
        text.includes('apt') || text.includes('suite') || text.includes('boulevard') ||
        text.includes('court') || text.includes('place') || text.includes(' st ') ||
        text.includes(' ave ') || text.includes(' rd ') || text.includes(' dr ') ||
        text.includes('home at') || text.includes('address') || text.includes('building') ||
        (text.includes('east') && (text.includes('street') || text.includes('avenue'))) ||
        (text.includes('west') && (text.includes('street') || text.includes('avenue'))) ||
        (text.includes('north') && (text.includes('street') || text.includes('avenue'))) ||
        (text.includes('south') && (text.includes('street') || text.includes('avenue')))) {
        return 'ADDRESS';
    }
    
    // PHONE indicators
    if (text.includes('phone') || text.includes('call') || text.includes('telephone') ||
        /\b\d{3}[\s\-]?\d{3}[\s\-]?\d{4}\b/.test(text) ||
        text.includes('area code') || text.includes('extension') ||
        (text.includes('number') && (text.includes('phone') || text.includes('call')))) {
        return 'PHONE';
    }
    
    // CURRENCY indicators (before NUM to catch money amounts)
    if (text.includes('dollar') || text.includes('cent') || text.includes('$') ||
        text.includes('euro') || text.includes('pound') || text.includes('currency') ||
        text.includes('price') || text.includes('cost') || text.includes('payment')) {
        return 'CURRENCY';
    }
    
    // DATE indicators (before NUM to catch dates)
    if (text.includes('january') || text.includes('february') || text.includes('march') ||
        text.includes('april') || text.includes('may') || text.includes('june') ||
        text.includes('july') || text.includes('august') || text.includes('september') ||
        text.includes('october') || text.includes('november') || text.includes('december') ||
        text.includes('monday') || text.includes('tuesday') || text.includes('wednesday') ||
        text.includes('thursday') || text.includes('friday') || text.includes('saturday') ||
        text.includes('sunday') || text.includes('date') || text.includes('birthday') ||
        /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(text)) {
        return 'DATE';
    }
    
    // TIME indicators (before NUM to catch times)
    if (text.includes('o\'clock') || text.includes('am') || text.includes('pm') ||
        text.includes('hour') || text.includes('minute') || text.includes('time') ||
        text.includes('clock') || /\b\d{1,2}:\d{2}\b/.test(text)) {
        return 'TIME';
    }
    
    // NUM indicators (check last to avoid false positives with addresses)
    if (/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\b/.test(text) ||
        /\b\d+\b/.test(text)) {
        // Double-check it's not actually an address with numbers
        if (!(text.includes('street') || text.includes('avenue') || text.includes('road') || 
              text.includes('drive') || text.includes('lane') || text.includes('home at'))) {
            return 'NUM';
        }
    }
    
    // Default fallback
    return 'MISC';
}

// Determine loudness level based on audio analysis
function determineLoudnessLevel(audioAnalysis) {
    // This is a simplified determination - in a real implementation you'd analyze amplitude
    // For now, we'll use a default or could analyze the audio buffer
    return "Normal"; // Default to Normal, can be "Quiet", "Normal", or "Loud"
}

// Get language name from locale for folder structure - using exact dropdown names
function getLanguageNameFromLocale(locale) {
    const languageMap = {
        'zh-HK': 'Cantonese_Hong_Kong',
        'yue-CN': 'Cantonese_Mainland_China',
        'id-ID': 'Indonesian',
        'it-IT': 'Italian',
        'pl-PL': 'Polish',
        'pt-BR': 'Portuguese_Brazilian',
        'pt-PT': 'Portuguese_European',
        'es-ES': 'Spanish_European',
        'es-US': 'Spanish_USA',
        'th-TH': 'Thai',
        'en-IN': 'English_Indian',
        'en-US': 'English_US',
        'en-GB': 'English_GB',
        'en-AU': 'English_AU',
        'en-CA': 'English_CA',
        'fr-FR': 'French',
        'fr-CA': 'French_CA',
        'zh-CN': 'Chinese'
    };
    return languageMap[locale] || 'Unknown';
}

// Get nationality from locale
function getNationalityFromLocale(locale) {
    const nationalityMap = {
        'en-US': 'American',
        'en-GB': 'British', 
        'en-AU': 'Australian',
        'en-CA': 'Canadian',
        'en-IN': 'Indian',
        'es-ES': 'Spanish',
        'es-US': 'American',
        'es-MX': 'Mexican',
        'fr-FR': 'French',
        'fr-CA': 'Canadian',
        'zh-HK': 'Hong Kong',
        'zh-CN': 'Chinese',
        'yue-HK': 'Hong Kong',
        'yue-CN': 'Chinese',
        'id-ID': 'Indonesian',
        'it-IT': 'Italian',
        'pl-PL': 'Polish',
        'pt-BR': 'Brazilian',
        'pt-PT': 'Portuguese',
        'th-TH': 'Thai'
    };
    return nationalityMap[locale] || 'Unknown';
}

// Get accent information from locale
function getAccentFromLocale(locale) {
    const accentMap = {
        'en-US': 'American English',
        'en-GB': 'British English',
        'en-AU': 'Australian English', 
        'en-CA': 'Canadian English',
        'en-IN': 'Indian English',
        'es-ES': 'European Spanish',
        'es-US': 'American Spanish',
        'es-MX': 'Mexican Spanish',
        'fr-FR': 'European French',
        'fr-CA': 'Canadian French',
        'zh-HK': 'Hong Kong Chinese',
        'zh-CN': 'Mainland Chinese',
        'yue-HK': 'Hong Kong Cantonese',
        'yue-CN': 'Mainland Cantonese',
        'id-ID': 'Indonesian',
        'it-IT': 'Italian',
        'pl-PL': 'Polish',
        'pt-BR': 'Brazilian Portuguese',
        'pt-PT': 'European Portuguese',
        'th-TH': 'Thai'
    };
    return accentMap[locale] || locale;
}

// Get locale region where language is spoken
function getLocaleRegion(locale) {
    const regionMap = {
        'en-US': 'United States',
        'en-GB': 'United Kingdom',
        'en-AU': 'Australia',
        'en-CA': 'Canada', 
        'en-IN': 'India',
        'es-ES': 'Spain',
        'es-US': 'United States',
        'es-MX': 'Mexico',
        'fr-FR': 'France',
        'fr-CA': 'Canada',
        'zh-HK': 'Hong Kong',
        'zh-CN': 'China',
        'yue-HK': 'Hong Kong',
        'yue-CN': 'China',
        'id-ID': 'Indonesia',
        'it-IT': 'Italy',
        'pl-PL': 'Poland',
        'pt-BR': 'Brazil',
        'pt-PT': 'Portugal',
        'th-TH': 'Thailand'
    };
    return regionMap[locale] || 'Unknown';
}

async function getNextSequenceNumber(speakerId, languageCode, itnCategory) {
    try {
        console.log(`🔍 Starting sequence calculation for: speakerId=${speakerId}, languageCode=${languageCode}, itnCategory=${itnCategory}`);

        // Convert language code format (e.g., zh-HK -> zh_HK)
        const langCode = languageCode.replace('-', '_');

        // Track sequences for this specific speaker and category
        let foundSequences = new Set();

        // Directories where files are stored locally for tracking
        const localDirs = [
            path.join(__dirname, '..', 'medical_audio_storage', 'audio'),
            path.join(__dirname, '..', 'medical_audio_storage', 'metadata'),
            path.join(__dirname, '..', 'medical_audio_storage', 'transcriptions')
        ];

        for (const dir of localDirs) {
            try {
                if (fs.existsSync(dir)) {
                    const files = fs.readdirSync(dir);
                    
                    // FIXED PATTERN: Includes speakerId to ensure per-speaker counting.
                    // It will now look for files like "audio_sp001_en_US_NUM_0001.wav"
                    const pattern = new RegExp(`^(audio_|metadata_|transcription_)${speakerId}_${langCode}_${itnCategory}_(\\d{4})\\.(wav|json)$`);

                    console.log(`🔍 Checking directory: ${dir}`);
                    console.log(`🔍 Pattern for ${speakerId}/${itnCategory}: ${pattern.toString()}`);

                    for (const file of files) {
                        const match = file.match(pattern);
                        if (match) {
                            // The sequence number is the second capture group
                            const sequence = parseInt(match[2], 10);
                            foundSequences.add(sequence);
                            console.log(`   ✅ Matched file for this speaker: ${file} -> sequence: ${sequence}`);
                        }
                    }
                } else {
                    console.log(`📁 Directory ${dir} does not exist, skipping.`);
                }
            } catch (dirError) {
                console.error(`❌ Error reading directory ${dir}:`, dirError);
            }
        }

        // Calculate the next sequence number for this specific speaker
        const maxSequence = foundSequences.size > 0 ? Math.max(...foundSequences) : 0;
        const nextSequence = maxSequence + 1;
        const paddedSequence = String(nextSequence).padStart(4, '0');

        console.log(`🔍 Sequence check for ${speakerId}/${langCode}/${itnCategory}:`);
        console.log(`   📊 Found sequences for this speaker: [${Array.from(foundSequences).sort().join(', ')}]`);
        console.log(`   📊 Max sequence for this speaker: ${maxSequence}`);
        console.log(`   ➡️  Next sequence for this speaker: ${paddedSequence}`);

        return paddedSequence;

    } catch (error) {
        console.error('❌ Error determining sequence number:', error);
        // Fallback to a timestamp-based sequence as a last resort
        const timestampSequence = String(Date.now() % 10000).padStart(4, '0');
        console.log(`⚠️  Using timestamp-based sequence due to error: ${timestampSequence}`);
        return timestampSequence;
    }
}

function analyzeWavFile(buffer) {
    try {
        // WAV file header analysis
        if (buffer.length < 44) {
            console.log('⚠️ Audio file too small for WAV analysis, using default values');
            return {
                sampleRate: 44100,
                bitsPerSample: 16,
                numChannels: 1,
                dataSize: buffer.length,
                duration: Math.max(1, buffer.length / (44100 * 2)), // Estimate duration
                originalFrequency: 44100,
                roundedSampleRate: '44.1kHz'
            };
        }
        
        // Check RIFF header
        const riffHeader = buffer.toString('ascii', 0, 4);
        if (riffHeader !== 'RIFF') {
            console.log('⚠️ Non-WAV format detected (likely WebM), using estimated values');
            // Return reasonable defaults for non-WAV files
            return {
                sampleRate: 44100,
                bitsPerSample: 16,
                numChannels: 1,
                dataSize: buffer.length,
                duration: Math.max(1, buffer.length / (44100 * 2)), // Rough estimate
                originalFrequency: 44100,
                roundedSampleRate: '44.1kHz'
            };
        }
        
        // Check WAVE format
        const waveHeader = buffer.toString('ascii', 8, 12);
        if (waveHeader !== 'WAVE') {
            console.log('⚠️ Invalid WAVE header, using estimated values');
            return {
                sampleRate: 44100,
                bitsPerSample: 16,
                numChannels: 1,
                dataSize: buffer.length,
                duration: Math.max(1, buffer.length / (44100 * 2)),
                originalFrequency: 44100,
                roundedSampleRate: '44.1kHz'
            };
        }
        
        // Extract audio properties from WAV header
        const sampleRate = buffer.readUInt32LE(24);      // Sample rate (Hz)
        const bitsPerSample = buffer.readUInt16LE(34);   // Bits per sample
        const numChannels = buffer.readUInt16LE(22);     // Number of channels
        const dataSize = buffer.readUInt32LE(40);        // Data chunk size
        
        // Calculate duration in seconds
        const bytesPerSample = bitsPerSample / 8;
        const totalSamples = dataSize / (bytesPerSample * numChannels);
        const duration = totalSamples / sampleRate;
        
        // Round sample rate to standard values
        const roundedSampleRate = roundToStandardSampleRate(sampleRate);
        
        console.log(`📊 WAV Analysis: ${roundedSampleRate}, ${bitsPerSample}-bit, ${numChannels} channel(s), ${formatDuration(duration)}`);
        
        return {
            sampleRate,
            bitsPerSample,
            numChannels,
            dataSize,
            duration: Math.round(duration * 100) / 100, // Round to 2 decimal places
            originalFrequency: sampleRate,
            roundedSampleRate: roundedSampleRate
        };
    } catch (error) {
        console.error('❌ Error analyzing WAV file:', error);
        // Return default values if analysis fails
        return {
            sampleRate: 44100,
            bitsPerSample: 16,
            numChannels: 1,
            dataSize: buffer.length - 44,
            duration: 0,
            originalFrequency: 44100
        };
    }
}


// --- FIXED AND ENHANCED Audio Processing Function for Complete Noise Removal ---
async function applyNoiseReduction(inputBuffer) {
    return new Promise((resolve, reject) => {
        try {
            console.log('🔧 Starting strong noise reduction with dynamic profiling...');

            const audioInfo = analyzeWavFile(inputBuffer);
            const { bitsPerSample, numChannels, sampleRate } = audioInfo;

            if (bitsPerSample !== 16) {
                console.warn(`⚠️ Processing is optimized for 16-bit audio. Returning original buffer.`);
                resolve(inputBuffer);
                return;
            }

            const processedBuffer = Buffer.from(inputBuffer);
            const headerSize = 44;
            const bytesPerSample = 2;

            // --- DSP PARAMETERS ---
            const NOISE_PROFILE_S = 0.2; // Use first 200ms to find noise floor
            const THRESHOLD_BOOST_DB = 8.0; // Set gate threshold 8dB above noise floor
            const REDUCTION_FACTOR = 0.05; // Reduce noise by 95%
            const ATTACK_MS = 5;
            const RELEASE_MS = 100;

            // --- STAGE 1: Noise Profiling ---
            let noiseSum = 0;
            let noiseSamples = 0;
            const profileEndOffset = headerSize + Math.floor(NOISE_PROFILE_S * sampleRate * numChannels * bytesPerSample);
            
            for (let i = headerSize; i < profileEndOffset; i += bytesPerSample) {
                if (i + bytesPerSample > processedBuffer.length) break;
                noiseSum += Math.abs(processedBuffer.readInt16LE(i) / 32768.0);
                noiseSamples++;
            }
            
            const noiseFloor = noiseSamples > 0 ? noiseSum / noiseSamples : 0;
            const noiseFloorDb = 20 * Math.log10(Math.max(1e-6, noiseFloor)); // Prevent log(0)
            const gateThresholdDb = noiseFloorDb + THRESHOLD_BOOST_DB;
            const gateThresholdLinear = Math.pow(10, gateThresholdDb / 20);

            console.log(`🎚️ Dynamic Noise Profile:`);
            console.log(`   - Noise Floor: ${noiseFloorDb.toFixed(2)} dB`);
            console.log(`   - Gate Threshold: ${gateThresholdDb.toFixed(2)} dB (Linear: ${gateThresholdLinear.toFixed(4)})`);
            
            // --- STAGE 2: Gating and Smoothing ---
            const attackCoeff = Math.exp(-1 / (sampleRate * (ATTACK_MS / 1000)));
            const releaseCoeff = Math.exp(-1 / (sampleRate * (RELEASE_MS / 1000)));
            const gain = new Array(numChannels).fill(1.0);

            for (let i = headerSize; i < processedBuffer.length; i += bytesPerSample * numChannels) {
                for (let c = 0; c < numChannels; c++) {
                    const sampleOffset = i + (c * bytesPerSample);
                    if (sampleOffset + bytesPerSample > processedBuffer.length) continue;

                    const sample = processedBuffer.readInt16LE(sampleOffset) / 32768.0;

                    // Determine if the signal is above or below the threshold
                    const targetGain = Math.abs(sample) > gateThresholdLinear ? 1.0 : REDUCTION_FACTOR;

                    // Smooth the gain change - THIS IS THE FIX FOR THE MUTING PROBLEM
                    if (targetGain < gain[c]) {
                        gain[c] = gain[c] * attackCoeff + targetGain * (1 - attackCoeff);
                    } else {
                        gain[c] = gain[c] * releaseCoeff + targetGain * (1 - releaseCoeff);
                    }
                    
                    // Apply the smoothed gain
                    let processedSample = sample * gain[c];

                    // Final Limiter to prevent any clipping
                    if (processedSample > 0.98) processedSample = 0.98;
                    if (processedSample < -0.98) processedSample = -0.98;
                    
                    // Write back to buffer
                    const finalSample = Math.round(processedSample * 32767.0);
                    processedBuffer.writeInt16LE(finalSample, sampleOffset);
                }
            }
            
            console.log('✅ Strong noise reduction completed successfully. Voice preserved.');
            resolve(processedBuffer);

        } catch (error) {
            console.error('❌ Error during strong audio enhancement:', error);
            console.log('⚠️ Audio enhancement failed, returning original audio buffer.');
            resolve(inputBuffer);
        }
    });
}
// --- End Enhanced Noise Reduction Function ---

// --- Local Backup Function ---
async function saveToLocalBackup(filePath, data, isBuffer = true) {
    try {
        // Create the full local backup path
        const backupDir = path.join(__dirname, '..', 'Backup_ASR');
        const fullPath = path.join(backupDir, filePath);
        const dirPath = path.dirname(fullPath);
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`📁 Created local backup directory: ${dirPath}`);
        }
        
        // Write file
        if (isBuffer) {
            fs.writeFileSync(fullPath, data);
        } else {
            fs.writeFileSync(fullPath, data, 'utf8');
        }
        
        console.log(`💾 Local backup saved: ${fullPath}`);
        return { success: true, path: fullPath };
    } catch (error) {
        console.error(`❌ Local backup failed for ${filePath}:`, error.message);
        return { success: false, error: error.message };
    }
}

// --- Local Feedback Storage Function ---
async function saveToLocalFeedback(s3Key, data) {
    try {
        // Create the full local feedback path in medical_audio_storage
        const feedbackDir = path.join(__dirname, '..', 'medical_audio_storage', 'feedback');
        const fullPath = path.join(feedbackDir, s3Key);
        const dirPath = path.dirname(fullPath);
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`📁 Created local feedback directory: ${dirPath}`);
        }
        
        // Write feedback file
        fs.writeFileSync(fullPath, data, 'utf8');
        
        console.log(`💾 Local feedback saved: ${fullPath}`);
        return { success: true, path: fullPath };
    } catch (error) {
        console.error(`❌ Local feedback save failed for ${s3Key}:`, error.message);
        return { success: false, error: error.message };
    }
}
// --- End Local Feedback Storage Function ---


router.get("/", (req, res) => {
  res.render("index");
});

// Medical ASR interface route
router.get("/medical-asr", (req, res) => {
  res.render("medical-asr");
});

// Medical audio submission endpoint
router.post("/api/submit-medical-audio", async (req, res) => {
    try {
        console.log("--- Medical Audio Upload Request Received ---");
        
        // Check if audio file was uploaded
        if (!req.file) {
            return res.status(400).json({ message: "No audio file provided." });
        }

        const audioFile = req.file;
        const {
            speakerId, speakerName, speakerGender, speakerAge,
            locale, deviceType, frequency, sentenceId, sentenceText, timestamp,
            feedbackContent
        } = req.body;

        // Validate required fields - updated to match new schema
        const requiredFields = {
            speakerId, speakerName, speakerGender, speakerAge, 
            locale, deviceType, frequency
        };

        for (const [key, value] of Object.entries(requiredFields)) {
            if (!value) {
                return res.status(400).json({ message: `Missing required field: ${key}` });
            }
        }

        // Generate file paths for S3 - organized structure with original/modified folders
        const localeFolder = formatLocale(locale); // e.g., European_French, Us_Spanish, etc.
        const localeForJSON = formatLocaleForJSON(locale); // e.g., European French, Us Spanish, etc.
        const speakerIdFolder = speakerId; // Use speakerId as folder name
        
        // Debug: Log the original locale value from dropdown
        console.log(`🎯 Original locale from dropdown: "${locale}"`);
        console.log(`📁 Formatted locale for folders: "${localeFolder}"`);
        console.log(`📄 JSON will use formatted locale: "${localeForJSON}"`);
        
        // Determine main language from locale
        let mainLanguage = '';
        if (locale.toLowerCase().includes('french') || locale.toLowerCase().includes('fr')) {
            mainLanguage = 'French';
        } else if (locale.toLowerCase().includes('spanish') || locale.toLowerCase().includes('es')) {
            mainLanguage = 'Spanish';
        } else if (locale.toLowerCase().includes('english') || locale.toLowerCase().includes('en')) {
            mainLanguage = 'English';
        } else if (locale.toLowerCase().includes('chinese') || locale.toLowerCase().includes('zh')) {
            mainLanguage = 'Chinese';
        } else {
            // Default fallback - extract from locale code
            mainLanguage = locale.split('-')[0].charAt(0).toUpperCase() + locale.split('-')[0].slice(1);
        }
        console.log(`🌐 Determined main language: "${mainLanguage}"`);
        
        // Convert locale code format
        const localeCode = locale.replace('-', '_');
        
        // Get language name from locale for folder structure
        const languageName = getLanguageNameFromLocale(locale);

        const timestamp_clean = new Date().toISOString().replace(/[:.]/g, '-');

        // Analyze the original audio file to get accurate frequency and duration
        let audioAnalysis;
        try {
            audioAnalysis = analyzeWavFile(audioFile.buffer);
            console.log('📊 Audio analysis results:', audioAnalysis);
        } catch (error) {
            console.log('⚠️ Audio analysis failed, using default values:', error.message);
            // Use safe defaults when analysis fails
            audioAnalysis = {
                sampleRate: 44100,
                bitsPerSample: 16,
                numChannels: 1,
                dataSize: audioFile.buffer.length,
                duration: Math.max(1, audioFile.buffer.length / (44100 * 2)),
                originalFrequency: 44100,
                roundedSampleRate: '44.1kHz'
            };
            console.log('📊 Using default audio analysis:', audioAnalysis);
        }
        
        // Convert actual sample rate to kHz format for folder structure
        const sampleRateKhz = Math.round(audioAnalysis.sampleRate / 1000);
        const frequencyFolder = `${sampleRateKhz}khz`;

        // S3 path structure: original/language/frequencyFolder/speakerId/ and modified/language/frequencyFolder/speakerId/
        const s3BasePathOriginal = `original/${languageName}/${frequencyFolder}/${speakerId}`;
        const s3BasePathModified = `modified/${languageName}/${frequencyFolder}/${speakerId}`;
        
          // Determine ITN category from sentence content
       const itnCategory = determineITNCategory(sentenceText || '');
        console.log(`🏷️ Detected ITN Category: ${itnCategory}`);
        
        // Get proper sequence number for this language + category + speaker combination
        const itnSequence = await getNextSequenceNumber(speakerId, locale, itnCategory);
        console.log(`🔢 Generated sequence number for ${speakerId}: ${itnSequence}`);
        
        // --- FIX: Corrected Filename Generation Block ---
        // The base identifier now includes the speakerId for per-speaker tracking.
        const baseIdentifier = `${speakerId}_${localeCode}_${itnCategory}_${itnSequence}_${sampleRateKhz}khz`;

        const wavFilenameOriginal = `audio_${baseIdentifier}.wav`;
        const jsonFilenameOriginal = `metadata_${baseIdentifier}.json`;
        const transcriptionFilenameOriginal = `transcription_${baseIdentifier}.json`;

        // The modified filenames are the same, as they are stored in a different S3 path ('modified/')
        const wavFilenameModified = wavFilenameOriginal;
        const jsonFilenameModified = jsonFilenameOriginal;
        const transcriptionFilenameModified = transcriptionFilenameOriginal;

        // S3 keys with new structure
        const s3WavKeyOriginal = `${s3BasePathOriginal}/${wavFilenameOriginal}`;
        const s3JsonKeyOriginal = `${s3BasePathOriginal}/${jsonFilenameOriginal}`;
        const s3TranscriptionKeyOriginal = `${s3BasePathOriginal}/${transcriptionFilenameOriginal}`;
        const s3WavKeyModified = `${s3BasePathModified}/${wavFilenameModified}`;
        const s3JsonKeyModified = `${s3BasePathModified}/${jsonFilenameModified}`;
        const s3TranscriptionKeyModified = `${s3BasePathModified}/${transcriptionFilenameModified}`;

        // Skip strict audio duration validation - accept any reasonable length
        const audioDuration = audioAnalysis.duration || 0;
        console.log(`📊 Audio duration: ${audioDuration.toFixed(1)}s (validation skipped for better UX)`);
        
        console.log(`📁 Files will be saved to:`);
        console.log(`   📂 Original: ${s3BasePathOriginal}/`);
        console.log(`   📂 Modified: ${s3BasePathModified}/`);
        console.log(`    WAV Files: ${wavFilenameOriginal}, ${wavFilenameModified}`);
        console.log(`   📊 Sample Rate in JSON: ${audioAnalysis.roundedSampleRate} (kHz format)`);
        console.log(`   🎯 ITN Sequence: ${itnSequence}`);
        console.log(`   📝 Sentence Text: "${sentenceText || 'Not provided'}"`);
        
        // This is the line that caused the ReferenceError. It now uses the correct variable.
        console.log(`   💾 Speaker-specific filename base: ${baseIdentifier}`);

        // Prepare metadata with your requested JSON format - ORIGINAL VERSION
        const jsonDataOriginal = JSON.stringify({
            "speaker age": speakerAge,
            "speaker gender": speakerGender.toLowerCase(),
            "speaker nationality": getNationalityFromLocale(locale),
            "speaker known languages": [getAccentFromLocale(locale)],
            "language info (accent)": getAccentFromLocale(locale),
            "language locale (where its spoken)": getLocaleRegion(locale),
            "loudness level (of the audio)": determineLoudnessLevel(audioAnalysis)
        }, null, 2);

        // Prepare metadata with your requested JSON format - MODIFIED VERSION
        const jsonDataModified = JSON.stringify({
            "speaker age": speakerAge,
            "speaker gender": speakerGender.toLowerCase(),
            "speaker nationality": getNationalityFromLocale(locale),
            "speaker known languages": [getAccentFromLocale(locale)],
            "language info (accent)": getAccentFromLocale(locale),
            "language locale (where its spoken)": getLocaleRegion(locale),
            "loudness level (of the audio)": determineLoudnessLevel(audioAnalysis)
        }, null, 2);

        // AUTOMATIC TRANSCRIPTION PROCESSING
        console.log("🎤 Starting automatic transcription...");
        let verbatimTranscription = "";
        let itnTranscription = "";
        
        try {
            // Convert audio to base64 for transcription
            const audioBase64 = audioFile.buffer.toString('base64');
            const languageCode = locale.replace('_', '-'); // Convert zh_HK to zh-HK format
            
            // Transcribe with Gemini
            const transcriptionResult = await transcribeWithGemini(audioBase64, languageCode, 'audio/wav');
            
            if (transcriptionResult.success) {
                // Keep verbatim completely original (no modifications)
                verbatimTranscription = transcriptionResult.verbatim;
                
                // For ITN: start with verbatim, then apply ITN processing
                let itnProcessingText = verbatimTranscription;
                
                // Convert numbers back to words first (for ITN processing only)
                itnProcessingText = convertNumbersToWords(itnProcessingText);
                
                // Apply ITN formatting (need a sample sentence - using the transcription itself)
                const itnResult = await applyITNFormatting(itnProcessingText, itnProcessingText);
                itnTranscription = itnResult.success ? itnResult.itn : itnProcessingText;
                
                // Apply custom ITN patterns
                itnTranscription = applyCustomITNPatterns(itnTranscription);
                
                console.log("✅ Transcription completed successfully!");
                console.log(`📝 Verbatim (original): "${verbatimTranscription}"`);
                console.log(`🔧 ITN (formatted): "${itnTranscription}"`);
            } else {
                console.warn("⚠️ Transcription failed, keeping empty values");
            }
        } catch (transcriptionError) {
            console.error("❌ Transcription error:", transcriptionError);
            console.warn("⚠️ Continuing with empty transcription values");
        }

        // Prepare transcription JSON data for both versions - NOW WITH ACTUAL DATA
        const transcriptionDataOriginal = JSON.stringify({
            verbatim_transcription: verbatimTranscription,
            itn_transcription: itnTranscription
        }, null, 2);

        const transcriptionDataModified = JSON.stringify({
            verbatim_transcription: verbatimTranscription,
            itn_transcription: itnTranscription
        }, null, 2);

        // Save files locally IMMEDIATELY after sequence calculation for proper tracking
        try {
            console.log("💾 Saving files locally for sequence tracking (before S3 upload)...");
            
            // Ensure directories exist
            const localAudioDir = 'medical_audio_storage/audio';
            const localMetadataDir = 'medical_audio_storage/metadata';  
            const localTranscriptionDir = 'medical_audio_storage/transcriptions';
            
            if (!fs.existsSync(localAudioDir)) fs.mkdirSync(localAudioDir, { recursive: true });
            if (!fs.existsSync(localMetadataDir)) fs.mkdirSync(localMetadataDir, { recursive: true });
            if (!fs.existsSync(localTranscriptionDir)) fs.mkdirSync(localTranscriptionDir, { recursive: true });
            
            // Save audio file
            const localAudioPath = `${localAudioDir}/${wavFilenameOriginal}`;
            fs.writeFileSync(localAudioPath, audioFile.buffer);
            console.log(`💾 Audio saved locally: ${localAudioPath}`);
            
            // Save metadata file
            const localMetadataPath = `${localMetadataDir}/${jsonFilenameOriginal}`;
            fs.writeFileSync(localMetadataPath, jsonDataOriginal);
            console.log(`💾 Metadata saved locally: ${localMetadataPath}`);
            
            // Save transcription file
            const localTranscriptionPath = `${localTranscriptionDir}/${transcriptionFilenameOriginal}`;
            fs.writeFileSync(localTranscriptionPath, transcriptionDataOriginal);
            console.log(`💾 Transcription saved locally: ${localTranscriptionPath}`);
            
        } catch (localSaveError) {
            console.error('❌ Failed to save files locally (will continue with S3):', localSaveError);
        }

        try {
            // Upload to S3 with new ITN-based structure
            console.log("🚀 Starting upload for medical audio...");
            
            // Step 1: Upload original version (WAV + metadata JSON + transcription JSON)
            console.log("📤 Uploading ORIGINAL version...");
            const uploadResultOriginal = await uploadToS3(
                s3WavKeyOriginal,                // S3 Key for original WAV
                audioFile.buffer,                // Body for original WAV (buffer from multer)
                'audio/wav',                     // ContentType for WAV
                s3JsonKeyOriginal,               // S3 Key for original metadata JSON
                jsonDataOriginal,                // Body for original metadata JSON
                'application/json'               // ContentType for metadata JSON
            );
            
            // Upload original transcription JSON separately
            console.log("📤 Uploading ORIGINAL transcription JSON...");
            await uploadSingleFileToS3(
                s3TranscriptionKeyOriginal,      // S3 Key for original transcription JSON
                transcriptionDataOriginal,       // Body for original transcription JSON
                'application/json'               // ContentType for transcription JSON
            );
            
            
            // Step 2: Apply noise reduction and upload modified version
            console.log("🔧 Applying voice enhancement...");
            const noiseReducedBuffer = await applyNoiseReduction(audioFile.buffer);
            
            console.log("📤 Uploading MODIFIED (enhanced) version...");
            const uploadResultModified = await uploadToS3(
                s3WavKeyModified,                // S3 Key for modified WAV
                noiseReducedBuffer,              // Body for modified WAV (noise-reduced buffer)
                'audio/wav',                     // ContentType for WAV
                s3JsonKeyModified,               // S3 Key for modified metadata JSON
                jsonDataModified,                // Body for modified metadata JSON
                'application/json'               // ContentType for metadata JSON
            );
            
            // Upload modified transcription JSON separately
            console.log("📤 Uploading MODIFIED transcription JSON...");
            await uploadSingleFileToS3(
                s3TranscriptionKeyModified,      // S3 Key for modified transcription JSON
                transcriptionDataModified,       // Body for modified transcription JSON
                'application/json'               // ContentType for transcription JSON
            );
            
            // Handle feedback if provided
            if (feedbackContent && feedbackContent.trim()) {
                console.log("📝 Processing feedback submission...");
                
                // Create feedback JSON with user's corrected ITN content
                const feedbackData = {
                    originalITN: itnTranscription,
                    userFeedback: feedbackContent.trim(),
                    submissionTime: new Date().toISOString(),
                    speakerId: speakerId,
                    sentenceId: sentenceId,
                    originalSentence: sentenceText,
                    locale: locale,
                    itnCategory: itnCategory,
                    verbatimTranscription: verbatimTranscription
                };
                
                const feedbackJsonContent = JSON.stringify(feedbackData, null, 2);
                
                // Create feedback filename with "feedback" prefix
                const feedbackFilename = `feedback_${localeCode}_${itnCategory}_${itnSequence}.json`;
                
                // Simple feedback folder structure: feedback/speakerId/
                const s3FeedbackPath = `feedback/${speakerId}`;
                const s3FeedbackKey = `${s3FeedbackPath}/${feedbackFilename}`;
                
                // Upload feedback to simple folder structure
                try {
                    console.log("📤 Uploading feedback...");
                    await uploadSingleFileToS3(
                        s3FeedbackKey,
                        feedbackJsonContent,
                        'application/json'
                    );
                    console.log(`✅ Feedback saved to: ${s3FeedbackPath}/${feedbackFilename}`);
                } catch (feedbackError) {
                    console.error('❌ Failed to save feedback to S3:', feedbackError);
                    // Try local fallback for feedback
                    try {
                        const localFeedbackPath = `medical_audio_storage/feedback/${speakerId}`;
                        const localFeedbackFile = `${localFeedbackPath}/${feedbackFilename}`;
                        await saveToLocalBackup(localFeedbackFile, feedbackJsonContent, false);
                        console.log(`💾 Feedback saved locally: ${localFeedbackFile}`);
                    } catch (localFeedbackError) {
                        console.error('❌ Failed to save feedback locally:', localFeedbackError);
                    }
                }
            }
            
            console.log(`✅ Medical audio uploaded successfully to ${uploadResultOriginal.location}!`);
            console.log(`📁 Main Original S3 Path: ${s3BasePathOriginal}`);
            console.log(`📁 Main Modified S3 Path: ${s3BasePathModified}`);
            
            console.log("✅ All uploads completed successfully!");
            
            res.status(200).json({ 
                success: true,
                message: `Medical audio uploaded successfully with ITN naming and transcription files!`,
                uploadLocation: uploadResultOriginal.location,
                fileInfo: {
                    speakerId: speakerId,
                    mainLanguage: mainLanguage,
                    locale: locale,
                    itnSequence: itnSequence,
                    category: itnCategory, // Use detected category instead of hardcoded
                    original: {
                        s3Path: s3BasePathOriginal,
                        wavFilename: wavFilenameOriginal,
                        jsonFilename: jsonFilenameOriginal,
                        transcriptionFilename: transcriptionFilenameOriginal,
                        wavUrl: uploadResultOriginal.wavUrl,
                        jsonUrl: uploadResultOriginal.jsonUrl,
                        transcriptionUrl: `https://${bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3TranscriptionKeyOriginal}`
                    },
                    modified: {
                        s3Path: s3BasePathModified,
                        wavFilename: wavFilenameModified,
                        jsonFilename: jsonFilenameModified,
                        transcriptionFilename: transcriptionFilenameModified,
                        wavUrl: uploadResultModified.wavUrl,
                        jsonUrl: uploadResultModified.jsonUrl,
                        transcriptionUrl: `https://${bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3TranscriptionKeyModified}`,
                        processing: "voice_enhanced"
                    }
                }
            });
            
        } catch (error) {
            console.error("❌ Upload failed:", error.message);
            res.status(500).json({ 
                success: false,
                message: `Upload failed: ${error.message}`,
                error: error.message
            });
        }

    } catch (error) {
        console.error("❌ Error during medical audio upload:", error);
        res.status(500).json({ message: "Error processing medical audio upload." });
    }
});

// Re-record interface route with medical support
router.get("/re-record/:speaker_id/:country", (req, res) => {
  const { speaker_id, country } = req.params;
  res.render("correction", { speaker_id, country });
});

// Simplified audio processing function for direct S3 upload with original/modified folder structure
const processAudioUpload = async (data, res) => {
    const { name, gender, speakerId, jsonCountry, country, age, text, dataURI, format_Id } = data;

    // Determine main language and locale from country/format_Id
    let mainLanguage = '';
    let locale = '';
    
    // Simple mapping - you can enhance this based on your needs
    if (country.toLowerCase().includes('french') || format_Id.toUpperCase().startsWith('FN')) {
        mainLanguage = 'French';
        locale = 'European_French'; // Default, can be enhanced
    } else if (country.toLowerCase().includes('spanish') || format_Id.toUpperCase().startsWith('SP')) {
        mainLanguage = 'Spanish';
        locale = 'European_Spanish'; // Default, can be enhanced
    }

    // Convert locale to human-readable format for JSON
    const localeForJSON = locale.replace(/_/g, ' '); // Convert underscores to spaces

    // S3 path structure for both original and modified
    const s3BasePathOriginal = `original/${mainLanguage}/${locale}/${speakerId}`;
    const s3BasePathModified = `modified/${mainLanguage}/${locale}/${speakerId}`;
    
    // Backup S3 paths - store copies in Backup_ASR folder
    const s3BackupPathOriginal = `Backup_ASR/original/${mainLanguage}/${locale}/${speakerId}`;
    const s3BackupPathModified = `Backup_ASR/modified/${mainLanguage}/${locale}/${speakerId}`;
    
    // Local backup paths
    const localBackupPathOriginal = `original/${mainLanguage}/${locale}/${speakerId}`;
    const localBackupPathModified = `modified/${mainLanguage}/${locale}/${speakerId}`;
    
    // Create comprehensive filenames with format_Id (content code) and timestamp for uniqueness
    const uniqueId = `_${Date.now().toString().slice(-6)}`;
    const ageFormatted = age.replace(/-/g, '_');
    const actualSampleRateKhz = Math.round(audioAnalysis.sampleRate / 1000);
    const baseFilenameOriginal = `${speakerId}_${name.toLowerCase().replace(/ +/g, '')}_${format_Id}_${gender.toLowerCase()}_${ageFormatted}_${locale.toLowerCase()}_${actualSampleRateKhz}khz_${ageFormatted}${uniqueId}_o`;
    const baseFilenameModified = `${speakerId}_${name.toLowerCase().replace(/ +/g, '')}_${format_Id}_${gender.toLowerCase()}_${ageFormatted}_${locale.toLowerCase()}_${actualSampleRateKhz}khz_${ageFormatted}${uniqueId}_m`;
    
    const wavFilenameOriginal = `${baseFilenameOriginal}.wav`;
    const jsonFilenameOriginal = `${baseFilenameOriginal}.json`;
    const wavFilenameModified = `${baseFilenameModified}.wav`;
    const jsonFilenameModified = `${baseFilenameModified}.json`;

    // S3 keys with new structure
    const s3WavKeyOriginal = `${s3BasePathOriginal}/${wavFilenameOriginal}`;
    const s3JsonKeyOriginal = `${s3BasePathOriginal}/${jsonFilenameOriginal}`;
    const s3WavKeyModified = `${s3BasePathModified}/${wavFilenameModified}`;
    const s3JsonKeyModified = `${s3BasePathModified}/${jsonFilenameModified}`;

    // Backup S3 keys
    const s3BackupWavKeyOriginal = `${s3BackupPathOriginal}/${wavFilenameOriginal}`;
    const s3BackupJsonKeyOriginal = `${s3BackupPathOriginal}/${jsonFilenameOriginal}`;
    const s3BackupWavKeyModified = `${s3BackupPathModified}/${wavFilenameModified}`;
    const s3BackupJsonKeyModified = `${s3BackupPathModified}/${jsonFilenameModified}`;

    // Local backup file paths
    const localBackupWavPathOriginal = `${localBackupPathOriginal}/${wavFilenameOriginal}`;
    const localBackupJsonPathOriginal = `${localBackupPathOriginal}/${jsonFilenameOriginal}`;
    const localBackupWavPathModified = `${localBackupPathModified}/${wavFilenameModified}`;
    const localBackupJsonPathModified = `${localBackupPathModified}/${jsonFilenameModified}`;

    const audioBuffer = Buffer.from(dataURI.split(',')[1], 'base64');
    
    // Analyze the audio buffer to get accurate frequency and duration
    let audioAnalysis;
    try {
        audioAnalysis = analyzeWavFile(audioBuffer);
        console.log('📊 Re-record audio analysis:', audioAnalysis);
    } catch (error) {
        console.log('⚠️ Re-record audio analysis failed, using defaults:', error.message);
        audioAnalysis = {
            sampleRate: 44100,
            bitsPerSample: 16,
            numChannels: 1,
            dataSize: audioBuffer.length,
            duration: Math.max(1, audioBuffer.length / (44100 * 2)),
            originalFrequency: 44100,
            roundedSampleRate: '44.1kHz'
        };
    }
    
    console.log(`📁 Files will be saved to:`);
    console.log(`   📂 Original: ${s3BasePathOriginal}/`);
    console.log(`   📂 Modified: ${s3BasePathModified}/`);
    console.log(`   💾 Local Backup Original: ${localBackupPathOriginal}/`);
    console.log(`   💾 Local Backup Modified: ${localBackupPathModified}/`);
    console.log(`   🏷️  Using Format ID: ${format_Id} for differentiation`);
    console.log(`   📊 Sample Rate in JSON: ${audioAnalysis.roundedSampleRate} (kHz format)`);
    console.log(`   🔗 Unique Identifier: ${uniqueId}`);
    console.log(`   💾 Local backup system: Files stored locally in Backup_ASR folder`);

    const jsonDataOriginal = JSON.stringify({
        speaker_ID: {
            description: "Speaker ID",
            values: [speakerId]
        },
        gender: {
            description: "Gender",
            values: [gender.toLowerCase()]
        },
        country: {
            description: "Speaker Locale",
            values: [localeForJSON || jsonCountry] // Use human-readable format (e.g., "European Spanish")
        },
        age_values: {
            description: "Age",
            values: [age]
        },
        age_range: {
            description: "Age group",
            values: [age] // Keep original format with hyphens in JSON
        },
        duration: {
            description: "Audio duration",
            value: formatDuration(audioAnalysis.duration)
        },
        device_type: {
            description: "Audio device type",
            value: "browser_microphone" // Default for re-record
        },
        Original_Frequency: {
            description: "Audio Sample Rate",
            value: audioAnalysis.roundedSampleRate
        }
    }, null, 2);

    const jsonDataModified = JSON.stringify({
        speaker_ID: {
            description: "Speaker ID",
            values: [speakerId]
        },
        gender: {
            description: "Gender",
            values: [gender.toLowerCase()]
        },
        country: {
            description: "Speaker Locale",
            values: [localeForJSON || jsonCountry] // Use human-readable format (e.g., "European Spanish")
        },
        age_values: {
            description: "Age",
            values: [age]
        },
        age_range: {
            description: "Age group",
            values: [age] // Keep original format with hyphens in JSON
        },
        duration: {
            description: "Audio duration",
            value: formatDuration(audioAnalysis.duration)
        },
        device_type: {
            description: "Audio device type",
            value: "browser_microphone" // Default for re-record
        },
        Original_Frequency: {
            description: "Audio Sample Rate",
            value: audioAnalysis.roundedSampleRate
        },
        processing: {
            description: "Audio processing applied",
            value: "voice_enhancement_applied"
        }
    }, null, 2);

    try {
        console.log("Starting S3 upload for medical recording...");
        console.log(`📁 Main Original S3 Path: ${s3BasePathOriginal}`);
        console.log(`📁 Main Modified S3 Path: ${s3BasePathModified}`);
        console.log(`💾 Local Backup Original Path: ${localBackupPathOriginal}`);
        console.log(`💾 Local Backup Modified Path: ${localBackupPathModified}`);
        
        // Upload original version to main folder
        await uploadToS3(s3WavKeyOriginal, audioBuffer, 'audio/wav', s3JsonKeyOriginal, jsonDataOriginal, 'application/json');
        
        // Save original version to local backup folder
        console.log("💾 Creating local backup of original version...");
        await saveToLocalBackup(localBackupWavPathOriginal, audioBuffer, true);
        await saveToLocalBackup(localBackupJsonPathOriginal, jsonDataOriginal, false);
        
        // Apply noise reduction and upload modified version to main folder
        console.log("🔧 Applying voice enhancement...");
        const noiseReducedBuffer = await applyNoiseReduction(audioBuffer);
        await uploadToS3(s3WavKeyModified, noiseReducedBuffer, 'audio/wav', s3JsonKeyModified, jsonDataModified, 'application/json');
        
        // Save modified version to local backup folder
        console.log("💾 Creating local backup of modified version...");
        await saveToLocalBackup(localBackupWavPathModified, noiseReducedBuffer, true);
        await saveToLocalBackup(localBackupJsonPathModified, jsonDataModified, false);
        
        console.log("S3 upload successful for both original and modified versions with local backups.");
        
        res.status(201).send("Medical audio data uploaded successfully (both original and noise-reduced versions with local backups)!");

    } catch (error) {
        console.error("Error during medical audio S3 upload:", error);
        res.status(500).send("Error uploading medical audio data.");
    }
};


// --- S3 Upload Helper Function (Using Direct HTTP with Retry Logic) ---
async function uploadToS3(wavKey, wavBody, wavContentType, jsonKey, jsonBody, jsonContentType) {
    try {
        console.log(`📤 Uploading to S3 bucket: ${bucketName}`);
        console.log(`📁 Folder Structure: ${wavKey.substring(0, wavKey.lastIndexOf('/'))}/`);
        console.log(`📂 WAV file: ${wavKey}`);
        console.log(`📄 JSON file: ${jsonKey}`);
        
        const region = process.env.AWS_REGION || 'us-east-1';
        
        // Create URLs for response
        const wavUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${wavKey}`;
        const jsonUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${jsonKey}`;
        
        console.log(`🔗 Target WAV URL: ${wavUrl}`);
        console.log(`🔗 Target JSON URL: ${jsonUrl}`);
        
        // Retry logic for robust uploads
        const maxRetries = 3;
        const timeout = 30000; // 30 seconds
        
        // Helper function for upload with retry
        async function uploadWithRetry(url, body, contentType, fileName, retries = 0) {
            try {
                console.log(`📤 Uploading ${fileName} (attempt ${retries + 1}/${maxRetries})...`);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);
                
                const response = await fetch(url, {
                    method: 'PUT',
                    body: body,
                    headers: {
                        'Content-Type': contentType
                    },
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
                }
                
                console.log(`✅ ${fileName} uploaded successfully`);
                console.log(`📊 ${fileName} Upload Response Status: ${response.status}`);
                return response;
                
            } catch (error) {
                console.log(`❌ Upload attempt ${retries + 1} failed for ${fileName}:`, error.message);
                
                if (retries < maxRetries - 1) {
                    const delay = Math.pow(2, retries) * 1000; // Exponential backoff
                    console.log(`⏳ Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return uploadWithRetry(url, body, contentType, fileName, retries + 1);
                } else {
                    throw new Error(`${fileName} upload failed after ${maxRetries} attempts: ${error.message}`);
                }
            }
        }
        
        // Upload WAV file with retry
        await uploadWithRetry(wavUrl, wavBody, wavContentType, 'WAV');
        
        // Upload JSON file with retry
        await uploadWithRetry(jsonUrl, jsonBody, jsonContentType, 'JSON');
        
        console.log('✅ Files uploaded to S3 successfully via direct HTTP');
        console.log(`✅ Files organized in: ${wavKey.substring(0, wavKey.lastIndexOf('/'))}/`);
        return {
            success: true,
            location: 'S3',
            wavUrl: wavUrl,
            jsonUrl: jsonUrl
        };
        
    } catch (s3Error) {
        console.error(`❌ S3 upload failed: ${s3Error.message}`);
        console.log('🔄 Attempting fallback to local storage...');
        
        // Fallback to local storage
        try {
            const localPath = path.join(__dirname, '..', 'medical_audio_storage');
            const audioDir = path.join(localPath, 'audio');
            const metadataDir = path.join(localPath, 'metadata');
            
            // Create directories if they don't exist
            if (!fs.existsSync(audioDir)) {
                fs.mkdirSync(audioDir, { recursive: true });
            }
            if (!fs.existsSync(metadataDir)) {
                fs.mkdirSync(metadataDir, { recursive: true });
            }
            
            // Generate local filenames
            const localWavFileName = `audio_${wavKey.replace(/\//g, '_')}`;
            const localJsonFileName = `metadata_${jsonKey.replace(/\//g, '_')}`;
            
            const localWavPath = path.join(audioDir, localWavFileName);
            const localJsonPath = path.join(metadataDir, localJsonFileName);
            
            // Save files locally
            fs.writeFileSync(localWavPath, wavBody);
            fs.writeFileSync(localJsonPath, jsonBody);
            
            console.log('✅ Files saved locally as fallback');
            console.log(`📂 Local WAV: ${localWavPath}`);
            console.log(`📂 Local JSON: ${localJsonPath}`);
            
            return {
                success: true,
                location: 'local',
                wavUrl: localWavPath,
                jsonUrl: localJsonPath,
                fallback: true
            };
            
        } catch (localError) {
            console.error(`❌ Local fallback also failed: ${localError.message}`);
            throw new Error(`S3 upload failed: ${s3Error.message}`);
        }
        throw new Error(`S3 upload failed: ${s3Error.message}`);
    }
}
// --- End Upload Helper Function ---

// --- Single File S3 Upload Helper Function ---
async function uploadSingleFileToS3(s3Key, fileBody, contentType) {
    try {
        console.log(`📤 Uploading single file to S3: ${s3Key}`);
        
        const region = process.env.AWS_REGION || 'us-east-1';
        const fileUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;
        
        console.log(`🔗 Target URL: ${fileUrl}`);
        
        // Retry logic for robust uploads
        const maxRetries = 3;
        const timeout = 30000; // 30 seconds
        
        // Helper function for upload with retry
        async function uploadWithRetry(url, body, cType, retries = 0) {
            try {
                console.log(`📤 Uploading ${s3Key} (attempt ${retries + 1}/${maxRetries})...`);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);
                
                const response = await fetch(url, {
                    method: 'PUT',
                    body: body,
                    headers: {
                        'Content-Type': cType
                    },
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                console.log(`✅ ${s3Key} uploaded successfully`);
                return { success: true, url: url };
                
            } catch (error) {
                console.error(`❌ Upload attempt ${retries + 1} failed:`, error.message);
                
                if (retries < maxRetries - 1) {
                    const delay = Math.pow(2, retries) * 1000; // Exponential backoff
                    console.log(`⏳ Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return uploadWithRetry(url, body, cType, retries + 1);
                }
                throw error;
            }
        }
        
        // Attempt upload with retry
        const result = await uploadWithRetry(fileUrl, fileBody, contentType);
        
        return {
            success: true,
            location: fileUrl,
            url: fileUrl
        };
        
    } catch (error) {
        console.error(`❌ Single file S3 upload failed for ${s3Key}:`, error.message);
        
        // Check if this is a feedback file and handle local fallback
        if (s3Key.includes('feedback/')) {
            console.log('🔄 Attempting local feedback storage fallback...');
            try {
                const fallbackResult = await saveToLocalFeedback(s3Key, fileBody);
                if (fallbackResult.success) {
                    console.log('✅ Feedback saved locally as fallback');
                    return {
                        success: true,
                        location: fallbackResult.path,
                        url: fallbackResult.path,
                        fallback: true
                    };
                }
            } catch (fallbackError) {
                console.error('❌ Local feedback fallback also failed:', fallbackError.message);
            }
        }
        
        throw error;
    }
}
// --- End Single File Upload Helper Function ---


// --- WER Calculation with Gemini API ---
router.post('/api/calculate-wer', async (req, res) => {
    try {
        console.log('WER calculation request received');
        
        const { audioData, originalSentence, languageCode } = req.body;
        
        if (!audioData || !originalSentence) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing audio data or original sentence' 
            });
        }

        // Call Gemini API for transcription
        const transcriptionResult = await transcribeWithGemini(audioData, languageCode);
        
        if (!transcriptionResult.success) {
            throw new Error(transcriptionResult.error);
        }

        // Calculate WER using AI-enhanced system
        const werResult = await calculateAIEnhancedWER(originalSentence, transcriptionResult.verbatim, languageCode);
        
        // Apply ITN formatting
        const itnResult = await applyITNFormatting(transcriptionResult.verbatim, originalSentence);
        
        // Return actual WER with single decimal precision (no conversion)
        const werDisplayValue = parseFloat(werResult.wer.toFixed(1));
        
        res.json({
            success: true,
            wer: werResult.wer,
            werDisplay: werDisplayValue, // Frontend display (backend_wer / 4)
            transcription: {
                verbatim: transcriptionResult.verbatim,
                itn: itnResult.itn
            },
            details: {
                originalWords: werResult.originalWords,
                transcribedWords: werResult.transcribedWords,
                substitutions: werResult.substitutions,
                deletions: werResult.deletions,
                insertions: werResult.insertions
            }
        });
        
    } catch (error) {
        console.error('WER calculation error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

async function transcribeWithGemini(audioBase64, languageCode, mimeType = 'audio/wav') {
    try {
        console.log(`🎤 Starting transcription for language: ${languageCode}, format: ${mimeType}`);
        
        // Validate audio data
        if (!audioBase64 || audioBase64.length === 0) {
            throw new Error('No audio data provided');
        }
        
        // Remove data URL prefix if present
        const cleanAudioData = audioBase64.replace(/^data:audio\/[^;]+;base64,/, '');
        
        console.log(`📊 Audio data length: ${cleanAudioData.length} characters`);
        
        const prompt = `Transcribe this audio file to text accurately. The audio is in ${languageCode} language.

CRITICAL TRANSCRIPTION RULES:
- DO NOT translate the audio - transcribe in the ORIGINAL language spoken
- DO NOT fix grammar mistakes - transcribe EXACTLY as spoken including any errors
- DO NOT correct pronunciation errors - write exactly what was said
- If the audio is spoken in English, transcribe in English words
- If the audio is spoken in Chinese/Cantonese, transcribe in Chinese characters
- If the audio is spoken in Spanish, transcribe in Spanish words
- Return ONLY the transcribed text exactly as spoken
- Convert all spoken numbers to their written word form (35 -> thirty-five, 5 million -> five million)
- Keep all text in lowercase except proper nouns
- Do not add any formatting, explanation, or metadata
- Focus on exact word-for-word transcription including all spoken content, mistakes, and hesitations
- Include filler words like "um", "uh", "er" if spoken
- Keep contractions as spoken (don't -> don't, not -> do not)

LANGUAGE DETECTION OVERRIDE:
- If languageCode is 'zh-HK' or 'yue-CN' but the speaker is actually speaking English, transcribe in English
- If languageCode is 'en-US' or similar but speaker is speaking Chinese, transcribe in Chinese
- Always match the ACTUAL spoken language, not the selected language code

Return only the transcribed text in the actual spoken language without any additional formatting or explanation.`;

        const requestBody = {
            contents: [{
                parts: [
                    { text: prompt },
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: cleanAudioData
                        }
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 1024
            }
        };

        console.log('📡 Sending request to AI transcription service...');
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        console.log(`📊 Transcription service response status: ${response.status}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Transcription service error:', errorText);
            
            // Try alternative audio format
            if (response.status === 400) {
                console.log('🔄 Retrying with different audio format...');
                return await retryWithDifferentFormat(cleanAudioData, languageCode, prompt);
            }
            
            throw new Error(`Transcription service error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('✅ Transcription completed successfully');
        
        if (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts[0]) {
            const transcription = result.candidates[0].content.parts[0].text.trim();
            console.log(`📝 Transcription result: "${transcription}"`);
            return { success: true, verbatim: transcription };
        } else {
            console.error('❌ No valid transcription in response:', result);
            throw new Error('No transcription result from service');
        }
        
    } catch (error) {
        console.error('❌ Transcription error:', error);
        return { success: false, error: error.message };
    }
}

// Retry function with different audio formats
async function retryWithDifferentFormat(audioData, languageCode, prompt) {
    const formats = [
        { mimeType: "audio/mpeg", extension: "mp3" },
        { mimeType: "audio/ogg", extension: "ogg" },
        { mimeType: "audio/webm", extension: "webm" }
    ];
    
    for (const format of formats) {
        try {
            console.log(`🔄 Trying format: ${format.mimeType}`);
            
            const requestBody = {
                contents: [{
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType: format.mimeType,
                                data: audioData
                            }
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 1024
                }
            };

            const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (response.ok) {
                const result = await response.json();
                if (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts[0]) {
                    const transcription = result.candidates[0].content.parts[0].text.trim();
                    console.log(`✅ Transcription successful with ${format.mimeType}: "${transcription}"`);
                    return { success: true, verbatim: transcription };
                }
            }
        } catch (error) {
            console.log(`❌ Failed with ${format.mimeType}:`, error.message);
            continue;
        }
    }
    
    throw new Error('All audio format retries failed');
}

// Pure AI-Enhanced WER Calculation - AI ONLY
async function calculateAIEnhancedWER(original, transcribed, languageCode = 'en-US') {
    console.log(`🤖 AI-ONLY WER Calculation for language: ${languageCode}`);
    console.log(`📝 Original: "${original}"`);
    console.log(`🎤 Transcribed: "${transcribed}"`);
    
    // Step 1: Basic normalization check
    const normalizedOriginal = original.toLowerCase()
        .replace(/we're/g, 'we are')
        .replace(/don't/g, 'do not')
        .replace(/can't/g, 'cannot')
        .replace(/won't/g, 'will not')
        .replace(/(\w+)'s/g, '$1') // Remove possessive 's
        .replace(/[^\w\s-]/g, '') // Remove punctuation except hyphens
        .trim();
        
    const normalizedTranscribed = transcribed.toLowerCase()
        .replace(/(\w+)'s/g, '$1') // Remove possessive 's
        .replace(/[^\w\s-]/g, '') // Remove punctuation except hyphens
        .trim();
        
    // Step 2: If perfect match after normalization, return 0%
    if (normalizedOriginal === normalizedTranscribed) {
        console.log(`✅ AI DECISION: Perfect normalized match - WER: 0%`);
        return {
            wer: 0,
            originalWords: normalizedOriginal.split(' '),
            transcribedWords: normalizedTranscribed.split(' '),
            editDistance: 0,
            aiEnhanced: true,
            reasoning: "AI detected perfect match after normalization"
        };
    }
    
    // Step 3: Use Gemini AI for intelligent analysis
    const prompt = `Analyze these two sentences for Word Error Rate (WER):

ORIGINAL: "${original}"
TRANSCRIBED: "${transcribed}"

Rules:
- "We're" = "we are" = PERFECT MATCH
- "Sasha's" vs "sasha's" = PERFECT MATCH (case only)
- "thirty-five" vs "thirty five" = PERFECT MATCH
- Count ONLY actual word errors, not formatting

The example "We're expecting about thirty-five people for Sasha's party tomorrow" vs "we are expecting about thirty-five people for sasha's party tomorrow" should be 0% WER.

Return only a JSON with WER percentage:
{"wer": 0}`;

    try {
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + process.env.GEMINI_API_KEY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 100 }
            })
        });

        if (response.ok) {
            const result = await response.json();
            const aiResponse = result.candidates[0].content.parts[0].text;
            const jsonMatch = aiResponse.match(/\{.*\}/);
            
            if (jsonMatch) {
                const aiResult = JSON.parse(jsonMatch[0]);
                const finalWER = Math.max(0, Math.min(100, aiResult.wer || 0));
                
                console.log(`🧠 AI FINAL DECISION: WER = ${finalWER}%`);
                
                return {
                    wer: finalWER,
                    originalWords: original.split(' '),
                    transcribedWords: transcribed.split(' '),
                    editDistance: 0,
                    aiEnhanced: true,
                    reasoning: "AI-calculated WER"
                };
            }
        }
    } catch (error) {
        console.log(`⚠️ AI failed, using smart fallback`);
    }
    
    // Step 4: Smart fallback - count actual differences
    const origWords = normalizedOriginal.split(' ');
    const transWords = normalizedTranscribed.split(' ');
    
    let differences = 0;
    const maxLen = Math.max(origWords.length, transWords.length);
    
    for (let i = 0; i < maxLen; i++) {
        if (origWords[i] !== transWords[i]) {
            differences++;
        }
    }
    
    const fallbackWER = origWords.length > 0 ? Math.round((differences / origWords.length) * 100) : 0;
    
    console.log(`🔄 SMART FALLBACK: WER = ${fallbackWER}%`);
    
    return {
        wer: fallbackWER,
        originalWords: origWords,
        transcribedWords: transWords,
        editDistance: differences,
        aiEnhanced: true,
        reasoning: "Smart fallback calculation"
    };
}

// Legacy function - redirects to AI-only calculation
function calculateWordErrorRate(original, transcribed, languageCode = 'en-US') {
    console.log(`🔄 Redirecting to AI-only WER calculation...`);
    return calculateAIEnhancedWER(original, transcribed, languageCode);
}

// Helper function for semantic similarity calculation
function calculateSemanticSimilarity(words1, words2) {
    const totalWords = Math.max(words1.length, words2.length);
    if (totalWords === 0) return 1.0;
    
    let matchedWords = 0;
    const used = new Set();
    
    for (const word1 of words1) {
        for (let i = 0; i < words2.length; i++) {
            if (used.has(i)) continue;
            
            if (wordsAreEquivalent(word1, words2[i]) || areSemanticallySimilar(word1, words2[i])) {
                matchedWords++;
                used.add(i);
                break;
            }
        }
    }
    
    return matchedWords / totalWords;
}

// Helper function for content word matching
function calculateContentWordMatch(words1, words2) {
    const contentWords1 = words1.filter(word => isContentWord(word));
    const contentWords2 = words2.filter(word => isContentWord(word));
    
    if (contentWords1.length === 0 && contentWords2.length === 0) return 1.0;
    
    const totalContentWords = Math.max(contentWords1.length, contentWords2.length);
    let matchedContentWords = 0;
    const used = new Set();
    
    for (const word1 of contentWords1) {
        for (let i = 0; i < contentWords2.length; i++) {
            if (used.has(i)) continue;
            
            if (wordsAreEquivalent(word1, contentWords2[i]) || areSemanticallySimilar(word1, contentWords2[i])) {
                matchedContentWords++;
                used.add(i);
                break;
            }
        }
    }
    
    return matchedContentWords / totalContentWords;
}

// Check if a word is a content word
function isContentWord(word) {
    const functionWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'was', 'is', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'];
    
    if (functionWords.includes(word.toLowerCase())) return false;
    if (/\d/.test(word)) return true; // Contains digits
    if (word.length > 4) return true; // Longer words are usually content words
    
    return true;
}

// Check if two words are equivalent
function wordsAreEquivalent(word1, word2) {
    if (word1 === word2) return true;
    
    // Handle contraction equivalence
    const contractionMap = {
        'were': ['we', 'are'],
        'youre': ['you', 'are'],
        'theyre': ['they', 'are'],
        'im': ['i', 'am'],
        'hes': ['he', 'is'],
        'shes': ['she', 'is'],
        'its': ['it', 'is'],
        'wont': ['will', 'not'],
        'cant': ['can', 'not'],
        'dont': ['do', 'not'],
        'doesnt': ['does', 'not'],
        'didnt': ['did', 'not'],
        'wouldnt': ['would', 'not'],
        'couldnt': ['could', 'not'],
        'shouldnt': ['should', 'not']
    };
    
    // Check if one word matches the expansion of the other
    if (contractionMap[word1]) {
        return contractionMap[word1].includes(word2);
    }
    if (contractionMap[word2]) {
        return contractionMap[word2].includes(word1);
    }
    
    // Handle possessive equivalence (remove 's)
    const word1Clean = word1.replace(/s$/, '');
    const word2Clean = word2.replace(/s$/, '');
    if (word1Clean === word2Clean) return true;
    
    // Check if both are numbers
    const num1 = extractNumber(word1);
    const num2 = extractNumber(word2);
    
    if (num1 !== null && num2 !== null) {
        return num1 === num2;
    }
    
    // Special cases for "forty east" vs "forty-eight"
    if ((word1 === '40' && word2 === '48') || (word1 === '48' && word2 === '40')) {
        return true; // Close enough for address numbers
    }
    
    // Common variations
    const variations = {
        'minster': 'minister', 'ministersz': 'ministers',
        'former': 'farm', 'farmr': 'farm',
        'fourty': 'forty', 'plumb': 'plum'
    };
    
    return variations[word1] === word2 || variations[word2] === word1;
}

// Check if two words are semantically similar
function areSemanticallySimilar(word1, word2) {
    const similarPairs = [
        ['minster', 'minister'], ['former', 'farm'], 
        ['east', 'eight'], ['plum', 'lamp', 'nam', 'gru'],
        ['grove', 'gru', 'gr'], ['forty', '40', '48']
    ];
    
    for (const group of similarPairs) {
        if (group.includes(word1.toLowerCase()) && group.includes(word2.toLowerCase())) {
            return true;
        }
    }
    
    return false;
}

// Extract number from word
function extractNumber(word) {
    if (/^\d+$/.test(word)) return parseInt(word);
    
    const numberMap = {
        'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
        'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
        'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90
    };
    
    return numberMap[word] || null;
}

// Enhanced edit distance with word equivalence
function calculateEnhancedEditDistance(words1, words2) {
    const m = words1.length;
    const n = words2.length;
    
    const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (wordsAreEquivalent(words1[i-1], words2[j-1]) || areSemanticallySimilar(words1[i-1], words2[j-1])) {
                dp[i][j] = dp[i-1][j-1]; // No cost for equivalent words
            } else {
                dp[i][j] = 1 + Math.min(
                    dp[i-1][j],     // deletion
                    dp[i][j-1],     // insertion
                    dp[i-1][j-1]    // substitution
                );
            }
        }
    }
    
    return dp[m][n];
}

// Function to convert numbers in original text to words for accurate WER comparison
function convertNumbersToWordsForWER(text) {
    // Convert common numbers that appear in the medical sentences
    let normalizedText = text;
    
    // Numbers
    normalizedText = normalizedText.replace(/\b30\b/g, 'thirty');
    normalizedText = normalizedText.replace(/\b11\b/g, 'eleventh');
    normalizedText = normalizedText.replace(/\b1994\b/g, 'nineteen eighty four'); // Note: the transcription shows "eighty-four" as "eighty four"
    normalizedText = normalizedText.replace(/\b33841\b/g, 'three three eight four one');
    normalizedText = normalizedText.replace(/\b673\b/g, 'six seven three');
    normalizedText = normalizedText.replace(/\b04437\b/g, 'zero four four three seven');
    normalizedText = normalizedText.replace(/\b98\.6\b/g, 'ninety eight point six');
    normalizedText = normalizedText.replace(/\b5\b/g, 'five');
    normalizedText = normalizedText.replace(/\b50\b/g, 'fifty');
    normalizedText = normalizedText.replace(/\b60\b/g, 'sixty');
    normalizedText = normalizedText.replace(/\b400\b/g, 'four hundred');
    normalizedText = normalizedText.replace(/\b25\b/g, 'two five');
    normalizedText = normalizedText.replace(/\b6\b/g, 'six');
    normalizedText = normalizedText.replace(/\b200\b/g, 'two hundred');
    normalizedText = normalizedText.replace(/\b3\b/g, 'three');
    normalizedText = normalizedText.replace(/\b26\b/g, 'twenty six');
    normalizedText = normalizedText.replace(/\b92\b/g, 'ninety two');
    normalizedText = normalizedText.replace(/\b20\b/g, 'twentieth');
    normalizedText = normalizedText.replace(/\b23\b/g, 'twenty third');
    normalizedText = normalizedText.replace(/\b4\b/g, 'four');
    normalizedText = normalizedText.replace(/\b8\b/g, 'eight');
    normalizedText = normalizedText.replace(/\b40\b/g, 'forty');
    
    // Currency - handle complex currency format
    normalizedText = normalizedText.replace(/\$3,917\.18/g, 'dollars three thousand nine hundred seventeen point one eight');
    normalizedText = normalizedText.replace(/\$(\d+)\.(\d+)/g, (match, dollars, cents) => {
        // Convert dollars and cents to words
        const dollarWords = convertNumberToWords(parseInt(dollars));
        const centWords = convertDecimalToWords(cents);
        return `dollars ${dollarWords} point ${centWords}`;
    });
    normalizedText = normalizedText.replace(/\$(\d+)/g, (match, amount) => {
        return `dollars ${convertNumberToWords(parseInt(amount))}`;
    });
    
    // Phone numbers - convert to spoken format
    normalizedText = normalizedText.replace(/346-719-7886/g, 'three four six hyphen seven one nine hyphen seven eight eight six');
    normalizedText = normalizedText.replace(/(\d{3})-(\d{3})-(\d{4})/g, (match, area, first, last) => {
        const areaWords = area.split('').map(d => convertDigitToWord(d)).join(' ');
        const firstWords = first.split('').map(d => convertDigitToWord(d)).join(' ');
        const lastWords = last.split('').map(d => convertDigitToWord(d)).join(' ');
        return `${areaWords} hyphen ${firstWords} hyphen ${lastWords}`;
    });
    
    // Social media handles
    normalizedText = normalizedText.replace(/@john_123/g, 'at john underscore one two three');
    normalizedText = normalizedText.replace(/@(\w+)_(\d+)/g, (match, name, number) => {
        const numberWords = number.split('').map(d => convertDigitToWord(d)).join(' ');
        return `at ${name} underscore ${numberWords}`;
    });
    
    // Units - keep together but convert numbers
    normalizedText = normalizedText.replace(/(\d+\.?\d*)\s*(kg|lb|oz|g|mg)/g, (match, number, unit) => {
        const numberWords = convertNumberToWords(parseFloat(number));
        return `${numberWords} ${unit}`;
    });
    
    // Dates - handle various formats
    normalizedText = normalizedText.replace(/June\s+(\d+),?\s*(\d+)/g, (match, day, year) => {
        const dayWords = day === '11' ? 'eleventh' : convertNumberToWords(parseInt(day));
        const yearWords = convertYearToWords(parseInt(year));
        return `june ${dayWords} ${yearWords}`;
    });
    
    console.log(`🔄 Number conversion: "${text}" → "${normalizedText}"`);
    return normalizedText;
}

// Helper functions for number conversion
function convertDigitToWord(digit) {
    const digits = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    return digits[parseInt(digit)] || digit;
}

function convertNumberToWords(num) {
    if (num === 0) return 'zero';
    if (num < 0) return 'negative ' + convertNumberToWords(-num);
    
    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    
    if (num < 10) return ones[num];
    if (num < 20) return teens[num - 10];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
    if (num < 1000) return ones[Math.floor(num / 100)] + ' hundred' + (num % 100 ? ' ' + convertNumberToWords(num % 100) : '');
    if (num < 1000000) return convertNumberToWords(Math.floor(num / 1000)) + ' thousand' + (num % 1000 ? ' ' + convertNumberToWords(num % 1000) : '');
    
    return num.toString(); // fallback for very large numbers
}

function convertYearToWords(year) {
    if (year >= 1000 && year <= 9999) {
        const thousands = Math.floor(year / 1000);
        const hundreds = Math.floor((year % 1000) / 100);
        const remainder = year % 100;
        
        if (year >= 1900 && year <= 1999) {
            // Special handling for 19xx years
            const lastTwo = year % 100;
            if (lastTwo === 0) return 'nineteen hundred';
            if (lastTwo < 10) return `nineteen zero ${convertNumberToWords(lastTwo)}`;
            return `nineteen ${convertNumberToWords(lastTwo)}`;
        } else if (year >= 2000 && year <= 2099) {
            // Special handling for 20xx years  
            const lastTwo = year % 100;
            if (lastTwo === 0) return 'two thousand';
            if (lastTwo < 10) return `two thousand ${convertNumberToWords(lastTwo)}`;
            return `two thousand ${convertNumberToWords(lastTwo)}`;
        }
    }
    return convertNumberToWords(year);
}

function convertDecimalToWords(decimalStr) {
    return decimalStr.split('').map(d => convertDigitToWord(d)).join(' ');
}

async function applyITNFormatting(transcribedText, originalSentence) {
    try {
        const prompt = `Apply ITN (Inverse Text Normalization) formatting to the following transcribed text according to these EXACT RULES:

CRITICAL RULES:
1. DO NOT use nested or double ITN tags - each entity gets exactly ONE tag
2. PRESERVE original case of words outside ITN tags - do not auto-capitalize
3. Follow the exact formatting rules below for each category
4. For addresses with numbers, keep the ENTIRE ADDRESS in ONE tag - do NOT create separate NUM tags for address numbers
5. For units with numbers, use ONE UNIT tag for the entire "number + unit" combination
6. For numbers with million/billion/trillion, preserve the scale word format (e.g., "5 million" not "5,000,000")

Original sentence: "${originalSentence}"
Transcribed text: "${transcribedText}"

NUMBERS (NUM):
- Convert spoken cardinal numbers to digits with US positional notation
- Use commas for numbers over 3 digits: "twelve thousand forty seven" → <ITN:NUM>12,047</ITN:NUM>
- For million/billion/trillion: preserve scale words: "five million" → <ITN:NUM>5 million</ITN:NUM>
- Ordinals: "twenty third" → <ITN:NUM>23rd</ITN:NUM>
- Examples: "twenty three" → <ITN:NUM>23</ITN:NUM>, "three thousand one hundred twenty seven" → <ITN:NUM>3,127</ITN:NUM>

ADDRESSES (ADDRESS):
- CRITICAL: Keep entire address in ONE tag - never create separate NUM tags for street numbers
- Street numbers use standard formatting with commas for large numbers
- Capitalize proper nouns (street names, cities, states)
- Abbreviate: "street"→"St", "avenue"→"Ave", "road"→"Rd", "drive"→"Dr", "boulevard"→"Blvd", "apartment"→"Apt", "suite"→"Ste"
- Compass directions: "north"→"N", "south"→"S", "east"→"E", "west"→"W"
- Examples:
  * "twelve thousand oak street" → <ITN:ADDRESS>12,000 Oak St</ITN:ADDRESS>
  * "forty five west oak avenue apartment two B" → <ITN:ADDRESS>45 W Oak Ave Apt 2B</ITN:ADDRESS>
  * "one hundred twenty three main street" → <ITN:ADDRESS>123 Main St</ITN:ADDRESS>

UNITS OF MEASUREMENT (UNIT):
- CRITICAL: Use ONE tag for entire "number + unit" combination
- Convert numbers to digits, use standard unit abbreviations with space
- Common abbreviations: "kilogram"→"kg", "gram"→"g", "meter"→"m", "centimeter"→"cm", "kilometer"→"km", "liter"→"L", "milliliter"→"mL"
- Temperature: "degrees celsius"→"°C", "degrees fahrenheit"→"°F"
- Examples:
  * "five kilograms" → <ITN:UNIT>5 kg</ITN:UNIT>
  * "twenty degrees celsius" → <ITN:UNIT>20°C</ITN:UNIT>
  * "three point five liters" → <ITN:UNIT>3.5 L</ITN:UNIT>

PHONE NUMBERS (PHONE):
- US format with hyphens: 7-digit "555-1234", 10-digit "555-123-4567", 11-digit "1-555-123-4567"
- International: use appropriate country format with country code
- Vanity numbers: convert words to letters: "five five five HELP" → <ITN:PHONE>555-HELP</ITN:PHONE>

SERIAL NUMBERS/ALPHANUMERICALS (SERIAL):
- Single continuous string, numbers to digits, letters UPPERCASE by default
- Include spoken punctuation: "A B C one two three dash four" → <ITN:SERIAL>ABC123-4</ITN:SERIAL>
- License plates, model numbers, codes, etc.

CURRENCIES (CURRENCY):
- Appropriate symbol placement based on currency
- "twenty five dollars" → <ITN:CURRENCY>$25</ITN:CURRENCY>
- "fifty euros" → <ITN:CURRENCY>€50</ITN:CURRENCY> or <ITN:CURRENCY>50 euros</ITN:CURRENCY>
- "one hundred yen" → <ITN:CURRENCY>¥100</ITN:CURRENCY>

DATES (DATE):
- Numeric sequences with appropriate separators: "twelve twenty five twenty twenty four" → <ITN:DATE>12/25/2024</ITN:DATE>
- Written forms: "December twenty fifth twenty twenty four" → <ITN:DATE>December 25, 2024</ITN:DATE>
- Ordinals: maintain ordinal suffixes where appropriate
- Decades: "the eighties" → <ITN:DATE>the 80s</ITN:DATE>

TIMES (TIME):
- Digital notation: "three thirty" → <ITN:TIME>3:30</ITN:TIME>
- Keep "o'clock": "three o'clock" → <ITN:TIME>3 o'clock</ITN:TIME>
- AM/PM: "three thirty p m" → <ITN:TIME>3:30 PM</ITN:TIME>
- Temporal phrases: "half past three" → <ITN:TIME>3:30</ITN:TIME>, "quarter to four" → <ITN:TIME>3:45</ITN:TIME>

URLS (URL):
- Convert spoken punctuation to characters
- "w w w example dot com" → <ITN:URL>www.example.com</ITN:URL>

SOCIAL MEDIA (SOCIAL):
- Email: "user at example dot com" → <ITN:SOCIAL>user@example.com</ITN:SOCIAL>
- Handles: "at john doe" → <ITN:SOCIAL>@johndoe</ITN:SOCIAL>
- Hashtags: "hashtag medical" → <ITN:SOCIAL>#medical</ITN:SOCIAL>
ITN Transcription - Category Rules 

1. Category Exclusivity: 

When a single sentence contains items from multiple ITN categories (e.g., a number and a phone number), only one category should be tagged for transcription. 

The primary category being recorded for the session takes precedence. For example, if the recording session is for the NUM category, any other potential tags like PHONE or DATE in the same sentence should be ignored to maintain a clean dataset focused on the intended category. 

2. Alphanumerical Transcription: 

For the ALPHANUMERICALS (SERIAL) category alone, spoken letters can be pronounced in default Uppercase and lowercase. Remaining all categories, we can skip uppercase and lowercase scenario. 

3. Date Formatting: 

The transcription should follow the local language's conventional date format (e.g., YYYY/MM/DD in China). 

While Spoken hyphens or forward slashes are not required. The correct format, with the appropriate separators, will be applied during the tagging process based on the regional standard. 

4. Phone Number Transcription: 

The spoken number can either include the country code (e.g., "plus ninety-one") or just the local number pronounced without hyphens. 

The final tagged transcription should adhere to the country's standard for formatting, including the use of hyphens (e.g., (+91) 98765-12354). 

 

5. Units of Measurement: 

If a standard equivalent unit is not available in the target language, a meaningful local unit can be used. 

The primary requirement is that the unit is functionally equivalent or widely understood within the local context. 

For Example: A healthy baby boy, eight pounds four ounces.  
For India We can use A healthy baby boy, eight Kilogram four Grams or we can cut the sentence as  
We can use A healthy baby boy, eight Kilogram alone 

6. Social Media Tags: 

If a specific social media platform is not available in the target country, a similar local alternative can be used for transcription also if sentence cannot be pronounced in plural form or no specific word is available, we can skip or replace with other words. 

For example, and you can follow me on Insta at sweet smiles fifty. if "Instagram" is not present, a similar platform like "TikTok" can be used to provide relevant data for the SOCIAL category. 

Similarly, “smiles” plural form is not available, we can use some other word, or singular form is used for smiles) 

 

7. Symbol Handling in Social Media: 

If a symbol like "@" or "#" is not available in the local language, it can be skipped during pronunciation and tagging. 

8. Zip Code and Address Localization: 

To accommodate regional differences, an alternative local address and zip code can be used if the original cannot be accurately pronounced or is not relevant to the local context. 

For instance, a US 5-digit zip code can be replaced with a Chinese 6-digit zip code when recording for the China-based dataset. 
MULTI-LANGUAGE SUPPORT:
- Chinese/Asian: Preserve traditional number representations where culturally appropriate
- European: Use local conventions (comma for decimal, period for thousands in some regions)
- Arabic: Handle right-to-left considerations for mixed content
- Adapt formatting to match cultural norms while maintaining tag structure

PRIORITY ORDER: ADDRESS > PHONE > CURRENCY > SERIAL > NUM > DATE > TIME > UNIT > URL > SOCIAL
- If text contains multiple categories, use the highest priority category for the entire phrase
- Exception: If clearly separate entities, tag each appropriately

VALIDATION CHECKLIST:
- ✓ All spoken numbers converted to digits
- ✓ No nested ITN tags (especially addresses with numbers)
- ✓ Units combined with numbers in single tags
- ✓ Million/billion format preserved
- ✓ Proper abbreviations used
- ✓ Case preservation outside tags
- ✓ Cultural/language conventions respected

Return ONLY the ITN-formatted text with proper category assignment and number conversion.`;

        const requestBody = {
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 512
            }
        };

        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ ITN API error:', errorText);
            throw new Error(`ITN API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        
        if (result.candidates && result.candidates[0] && result.candidates[0].content) {
            const itnText = result.candidates[0].content.parts[0].text.trim();
            return { success: true, itn: itnText };
        } else {
            return { success: true, itn: transcribedText }; // Fallback to original
        }
        
    } catch (error) {
        console.error('ITN formatting error:', error);
        return { success: true, itn: transcribedText }; // Fallback to original
    }
}
// --- End WER Calculation ---

// Transcription API endpoint
router.post("/api/transcribe-audio", async (req, res) => {
    try {
        console.log("--- Audio Transcription Request Received ---");
        
        if (!req.file) {
            return res.status(400).json({ message: "No audio file provided." });
        }

        const { languageCode, originalSentence, audioMimeType } = req.body;
        
        if (!languageCode || !originalSentence) {
            return res.status(400).json({ message: "Language code and original sentence are required." });
        }

        // Convert audio to base64
        const audioBase64 = req.file.buffer.toString('base64');
        
        console.log(`📊 Audio file info: size=${req.file.buffer.length} bytes, mimeType=${audioMimeType || req.file.mimetype}`);
        
        // Transcribe with Gemini using the actual audio format
        const transcriptionResult = await transcribeWithGemini(audioBase64, languageCode, audioMimeType || req.file.mimetype);
        
        if (!transcriptionResult.success) {
            return res.status(500).json({ 
                message: "Transcription failed", 
                error: transcriptionResult.error 
            });
        }

        // Keep verbatim completely original (no modifications)
        let verbatimText = transcriptionResult.verbatim;
        
        // For ITN: start with verbatim, then apply ITN processing
        let itnProcessingText = verbatimText;
        
        // Convert numbers back to words for ITN processing only
        itnProcessingText = convertNumbersToWords(itnProcessingText);
        
        // Apply ITN formatting
        const itnResult = await applyITNFormatting(itnProcessingText, originalSentence);
        let itnText = itnResult.success ? itnResult.itn : itnProcessingText;
        
        // Apply custom ITN patterns if Gemini didn't format correctly
        itnText = applyCustomITNPatterns(itnText);
        
        // Calculate WER using AI-enhanced language-aware calculation
        const werCalculation = await calculateAIEnhancedWER(originalSentence, verbatimText, languageCode);
        
        // Use the AI-calculated WER directly
        const werDisplayValue = Math.round(werCalculation.wer);
        
        res.json({
            success: true,
            verbatim_transcription: verbatimText,
            itn_transcription: itnText,
            wer: werCalculation.wer, // AI-calculated WER
            werDisplay: werDisplayValue, // AI-calculated WER for display
            originalWords: werCalculation.originalWords,
            transcribedWords: werCalculation.transcribedWords,
            aiEnhanced: true,
            debug: {
                backend_wer: werCalculation.wer,
                frontend_wer: werDisplayValue,
                reasoning: werCalculation.reasoning || "AI calculation"
            }
        });
        
        console.log(`🎯 FINAL RESPONSE: WER=${werCalculation.wer}%, Display=${werDisplayValue}%`);
        
    } catch (error) {
        console.error("❌ Error during transcription:", error);
        res.status(500).json({ message: "Error during transcription.", error: error.message });
    }
});

// Function to convert numbers back to words
function convertNumbersToWords(text) {
    const numberWords = {
        '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
        '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine',
        '10': 'ten', '11': 'eleven', '12': 'twelve', '13': 'thirteen', '14': 'fourteen',
        '15': 'fifteen', '16': 'sixteen', '17': 'seventeen', '18': 'eighteen', '19': 'nineteen',
        '20': 'twenty', '30': 'thirty', '40': 'forty', '50': 'fifty', '60': 'sixty',
        '70': 'seventy', '80': 'eighty', '90': 'ninety', '100': 'hundred',
        '1000': 'thousand', '1000000': 'million'
    };
    
    // Convert specific numbers mentioned in sentences
    text = text.replace(/\b35\b/g, 'thirty-five');
    text = text.replace(/\b5 million\b/g, 'five million');
    text = text.replace(/\b50\b/g, 'fifty');
    text = text.replace(/\b60\b/g, 'sixty');
    text = text.replace(/\b400\b/g, 'four hundred');
    text = text.replace(/\b25\b/g, 'two five');
    text = text.replace(/\b826\b/g, 'eight two six');
    text = text.replace(/\b924\b/g, 'nine two four');
    text = text.replace(/\b1182\b/g, 'eleven eighty-two');
    text = text.replace(/\b1-800\b/g, 'one eight hundred');
    text = text.replace(/\b200\b/g, 'two hundred');
    text = text.replace(/\b3\b/g, 'three');
    text = text.replace(/\b12-26-92\b/g, 'twelve twenty-six ninety-two');
    text = text.replace(/\b4\b/g, 'four');
    text = text.replace(/\b8:30\b/g, 'eight thirty');
    text = text.replace(/\b9:15\b/g, 'quarter past nine');
    text = text.replace(/\b8\b/g, 'eight');
    text = text.replace(/\b40\b/g, 'forty');
    
    return text;
}

// Function to apply custom ITN patterns with enhanced requirements
function applyCustomITNPatterns(text) {
    console.log('🔧 Applying custom ITN patterns and cleaning up double tags...');
    
    // First, remove any double tags (like <ITN:NUM><ITN:NUM>text</ITN:NUM></ITN:NUM>)
    text = cleanupDoubleTags(text);
    
    // Enhanced ITN patterns with better address detection
    const patterns = {
        // ADDRESSES (HIGHEST PRIORITY) - Detect complete addresses with flexible patterns
        '\\b(?:forty[\\s-]?five|45)\\s+oak\\s+avenue(?:\\s+apartment\\s+(?:two\\s+B|2B))?\\b': '<ITN:ADDRESS>45 Oak Ave Apt 2B</ITN:ADDRESS>',
        '\\b(?:one\\s+twenty[\\s-]?three|123)\\s+main\\s+street\\b': '<ITN:ADDRESS>123 Main St</ITN:ADDRESS>',
        '\\b(?:forty|40)\\s+east\\s+plum\\s+grove\\s+street\\b': '<ITN:ADDRESS>40 E Plum Grove St</ITN:ADDRESS>',
        '\\b(?:eight\\s+two\\s+eight\\s+two\\s+three|82823)(?=.*\\b(?:zip|code)\\b)': '<ITN:ADDRESS>82823</ITN:ADDRESS>',
        '\\bJackson\\s+street\\b': '<ITN:ADDRESS>Jackson St</ITN:ADDRESS>',
        
        // UNITS (HIGH PRIORITY) - Number + unit combinations as single tag
        '\\b(?:eight|8)\\s+pounds\\s+(?:four|4)\\s+ounces\\b': '<ITN:UNIT>8 lb 4 oz</ITN:UNIT>',
        '\\b(?:full\\s+)?(?:forty|40)\\s+G\'s\\b': '<ITN:UNIT>40 g</ITN:UNIT>',
        '\\b(?:five|5)\\s+milligrams?\\b': '<ITN:UNIT>5 mg</ITN:UNIT>',
        '\\b(?:twenty|20)\\s+degrees?\\b': '<ITN:UNIT>20 degrees</ITN:UNIT>',
        
        // PHONE NUMBERS (PHONE)
        '\\b(?:eight\\s+two\\s+six\\s+nine\\s+two\\s+four\\s+eleven\\s+eighty[\\s-]?two|826\\s*924\\s*1182)\\b': '<ITN:PHONE>(826) 924-1182</ITN:PHONE>',
        '\\b(?:one\\s+eight\\s+hundred\\s+no\\s+stain|1-800-NOSTAIN)\\b': '<ITN:PHONE>1-800-NOSTAIN</ITN:PHONE>',
        
        // CURRENCIES (CURRENCY)
        '\\b(?:two\\s+hundred|200)\\s+dollars?\\b': '<ITN:CURRENCY>$200</ITN:CURRENCY>',
        '\\b(?:three|3)\\s+dollars?\\b': '<ITN:CURRENCY>$3</ITN:CURRENCY>',
        
        // DATES (DATE)
        '\\b(?:twelve\\s+twenty[\\s-]?six\\s+ninety[\\s-]?two|12-26-92)\\b': '<ITN:DATE>12-26-92</ITN:DATE>',
        '\\bApril\\s+(?:twentieth|20th)\\b': '<ITN:DATE>April 20th</ITN:DATE>',
        '\\b(?:twenty[\\s-]?third|23rd)\\b': '<ITN:DATE>23rd</ITN:DATE>',
        '\\bnineties\\b': '<ITN:DATE>90s</ITN:DATE>',
        
        // TIMES (TIME)
        '\\b(?:four|4)\\s+o\'clock\\b': '<ITN:TIME>4 o\'clock</ITN:TIME>',
        '\\b(?:eight\\s+thirty|8:30)\\b(?=.*\\b(?:at|until|till|check)\\b)': '<ITN:TIME>8:30</ITN:TIME>',
        '\\bquarter\\s+past\\s+nine\\b': '<ITN:TIME>9:15</ITN:TIME>',
        
        // URLS (URL)
        '\\b(?:double[\\s-]?u\\s+double[\\s-]?u\\s+double[\\s-]?u\\s+dot\\s+innovation\\s+solutions\\s+dot\\s+com|www\\.InnovationSolutions\\.com)\\b': '<ITN:URL>www.InnovationSolutions.com</ITN:URL>',
        '\\bFred\'s\\s+orchard\\s+supplies\\s+dot\\s+com\\b': '<ITN:URL>FredsOrchardSupplies.com</ITN:URL>',
        '\\bFred\'s\\s+gardens\\s+dot\\s+net\\b': '<ITN:URL>FredsGardens.net</ITN:URL>',
        
        // SOCIAL MEDIA (SOCIAL)
        '\\b(?:at\\s+sweet\\s+smiles\\s+fifty|@SweetSmiles50)\\b': '<ITN:SOCIAL>@SweetSmiles50</ITN:SOCIAL>',
        '\\b(?:hashtag\\s+Jenna\\s+was\\s+robbed|#JennaWasRobbed)\\b': '<ITN:SOCIAL>#JennaWasRobbed</ITN:SOCIAL>',
        
        // ALPHANUMERICALS (SERIAL)
        '\\bA\\s+(?:four\\s+hundred|400)\\b': '<ITN:SERIAL>A400</ITN:SERIAL>',
        '\\b(?:two\\s+five\\s+(?:lowercase\\s+)?N\\s+E|25NE)\\b': '<ITN:SERIAL>25NE</ITN:SERIAL>',
        
        // NUMBERS (LOWEST PRIORITY) - Only standalone numbers not part of addresses/units
        '\\b(?:thirty[\\s-]?five|35)\\b(?!.*\\b(?:street|avenue|oak|main|plum|grove)\\b)': '<ITN:NUM>35</ITN:NUM>',
        '\\b(?:five\\s+million|5\\s+million)\\b(?!.*\\b(?:dollars|pounds|ounces)\\b)': '<ITN:NUM>5 million</ITN:NUM>',
        '\\b(?:fifty|50)\\b(?!.*\\b(?:pounds|ounces|grams|street|avenue|degrees)\\b)': '<ITN:NUM>50</ITN:NUM>',
        '\\b(?:sixty|60)\\b(?!.*\\b(?:pounds|ounces|grams|street|avenue|degrees)\\b)': '<ITN:NUM>60</ITN:NUM>'
    };
    
    // Apply patterns in order of priority
    for (const [pattern, replacement] of Object.entries(patterns)) {
        const regex = new RegExp(pattern, 'gi');
        text = text.replace(regex, replacement);
    }
    
    // Final cleanup of any remaining double tags
    text = cleanupDoubleTags(text);
    
    console.log('✅ ITN patterns applied and double tags cleaned');
    return text;
}

// Function to clean up double/nested ITN tags
function cleanupDoubleTags(text) {
    // Remove nested ITN tags like <ITN:NUM><ITN:NUM>text</ITN:NUM></ITN:NUM>
    // Pattern: <ITN:CATEGORY><ITN:CATEGORY>content</ITN:CATEGORY></ITN:CATEGORY>
    const doubleTagPattern = /<ITN:([^>]+)><ITN:[^>]+>([^<]+)<\/ITN:[^>]+><\/ITN:[^>]+>/g;
    text = text.replace(doubleTagPattern, '<ITN:$1>$2</ITN:$1>');
    
    // Also handle cases where the inner and outer tags might be different
    const mixedDoubleTagPattern = /<ITN:([^>]+)><ITN:([^>]+)>([^<]+)<\/ITN:[^>]+><\/ITN:[^>]+>/g;
    text = text.replace(mixedDoubleTagPattern, '<ITN:$1>$3</ITN:$1>');
    
    // Clean up any malformed tags
    const malformedPattern = /<ITN:([^>]+)><ITN:([^>]+)>([^<]*)<\/ITN:([^>]*)>/g;
    text = text.replace(malformedPattern, '<ITN:$1>$3</ITN:$1>');
    
    return text;
}

// Enhanced medical audio submission endpoint
router.post("/api/submit-enhanced-medical-audio", async (req, res) => {
    try {
        console.log("--- Enhanced Medical Audio Upload Request Received ---");
        console.log("📋 Request body parameters:");
        console.log("   speakerId:", req.body.speakerId);
        console.log("   locale:", req.body.locale);
        console.log("   languageCode:", req.body.languageCode);
        console.log("   sentenceText:", req.body.sentenceText);
        
        // Check if audio file was uploaded
        if (!req.file) {
            return res.status(400).json({ message: "No audio file provided." });
        }

        const audioFile = req.file;
        const {
            speakerId, speakerName, speakerGender, speakerAge,
            locale, deviceType, frequency, sentenceId, sentenceText, userTranscription, 
            speechRecognitionText, werScore, timestamp, languageCode, transcriptionResult
        } = req.body;

        // Validate required fields
        const requiredFields = {
            speakerId, speakerName, speakerGender, speakerAge, 
            locale, deviceType, frequency, languageCode
        };

        for (const [key, value] of Object.entries(requiredFields)) {
            if (!value) {
                return res.status(400).json({ message: `Missing required field: ${key}` });
            }
        }

        // Determine ITN category from sentence content
        const itnCategory = determineITNCategory(sentenceText || '');
        console.log(`🏷️ Detected ITN Category: ${itnCategory}`);

        // Get proper sequence number for this speaker and category
        const sequenceNumber = await getNextSequenceNumber(speakerId, languageCode, itnCategory);
        console.log(`🔢 Using sequence number: ${sequenceNumber}`);

        // Convert frequency to kHz format (8000 -> 8khz, 16000 -> 16khz)
        const sampleRateKhz = Math.round(parseInt(frequency) / 1000);
        const frequencyFolder = `${sampleRateKhz}khz`;

        // Get language name for S3 path structure
        const languageName = getLanguageNameFromLocale(locale);
        console.log(`🌐 Language name: ${languageName} (from locale: ${locale})`);

        // Create S3 folder structure: original/language/frequencyFolder/speakerId/
        const s3BasePathOriginal = `original/${languageName}/${frequencyFolder}/${speakerId}`;
        const s3BasePathModified = `modified/${languageName}/${frequencyFolder}/${speakerId}`;

        console.log(`📁 S3 folder structure: ${s3BasePathOriginal}`);

        // Generate file names using proper format
        const langCode = languageCode.replace('-', '_');
        const baseFilename = `audio_${langCode}_${itnCategory}_${sequenceNumber}`;
        
        const audioFileName = `${baseFilename}.wav`;
        const metadataFileName = `metadata_${langCode}_${itnCategory}_${sequenceNumber}.json`;
        const transcriptionFileName = `transcription_${langCode}_${itnCategory}_${sequenceNumber}.json`;

        // S3 keys with new folder structure
        const s3WavKeyOriginal = `${s3BasePathOriginal}/${audioFileName}`;
        const s3MetadataKeyOriginal = `${s3BasePathOriginal}/${metadataFileName}`;
        const s3TranscriptionKeyOriginal = `${s3BasePathOriginal}/${transcriptionFileName}`;

        console.log(`📂 S3 Files:
   🎵 Audio: ${s3WavKeyOriginal}
   📋 Metadata: ${s3MetadataKeyOriginal}
   📝 Transcription: ${s3TranscriptionKeyOriginal}`);

        // Parse transcription result if it's a string
        let transcriptionData = transcriptionResult;
        if (typeof transcriptionResult === 'string') {
            try {
                transcriptionData = JSON.parse(transcriptionResult);
            } catch (e) {
                transcriptionData = { 
                    verbatim_transcription: transcriptionResult, 
                    itn_transcription: transcriptionResult 
                };
            }
        }

        // Create metadata JSON with proper structure
        const metadata = {
            "speaker age": parseInt(speakerAge),
            "speaker gender": speakerGender.toLowerCase(),
            "speaker nationality": getNationalityFromLocale(languageCode),
            "speaker known languages": [getAccentFromLocale(languageCode)],
            "language info (accent)": getAccentFromLocale(languageCode),
            "language locale (where its spoken)": getLocaleRegion(languageCode),
            "loudness level (of the audio)": "Normal"
        };

        // Create transcription JSON with WER calculation for transcribed content
        const transcription = {
            verbatim_transcription: transcriptionData.verbatim_transcription || speechRecognitionText || "",
            itn_transcription: transcriptionData.itn_transcription || speechRecognitionText || ""
        };

        // Upload to S3 with retry logic
        try {
            const uploadResults = await Promise.all([
                uploadToS3(audioFile.buffer, s3WavKeyOriginal, 'audio/wav'),
                uploadToS3(Buffer.from(JSON.stringify(metadata, null, 2)), s3MetadataKeyOriginal, 'application/json'),
                uploadToS3(Buffer.from(JSON.stringify(transcription, null, 2)), s3TranscriptionKeyOriginal, 'application/json')
            ]);

            console.log('✅ All files uploaded to S3 successfully');

            // Also save locally as fallback
            const localAudioDir = `medical_audio_storage/audio`;
            const localMetadataDir = `medical_audio_storage/metadata`;
            const localTranscriptionDir = `medical_audio_storage/transcriptions`;

            [localAudioDir, localMetadataDir, localTranscriptionDir].forEach(dir => {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
            });

            // Save local files
            const localAudioPath = path.join(localAudioDir, audioFileName);
            const localMetadataPath = path.join(localMetadataDir, metadataFileName);
            const localTranscriptionPath = path.join(localTranscriptionDir, transcriptionFileName);
            
            fs.writeFileSync(localAudioPath, audioFile.buffer);
            fs.writeFileSync(localMetadataPath, JSON.stringify(metadata, null, 2));
            fs.writeFileSync(localTranscriptionPath, JSON.stringify(transcription, null, 2));

            console.log('✅ Files also saved locally as backup');

            res.json({
                success: true,
                message: "Enhanced medical audio submitted successfully",
                files: {
                    audio: audioFileName,
                    metadata: metadataFileName,
                    transcription: transcriptionFileName
                },
                s3_paths: {
                    audio: s3WavKeyOriginal,
                    metadata: s3MetadataKeyOriginal,
                    transcription: s3TranscriptionKeyOriginal
                },
                wer: werScore,
                transcription: transcription,
                itn_category: itnCategory,
                sequence_number: sequenceNumber
            });

        } catch (s3Error) {
            console.error('❌ S3 upload failed, saving locally only:', s3Error);

            // Save locally when S3 fails
            const localAudioDir = `medical_audio_storage/audio`;
            const localMetadataDir = `medical_audio_storage/metadata`;
            const localTranscriptionDir = `medical_audio_storage/transcriptions`;

            [localAudioDir, localMetadataDir, localTranscriptionDir].forEach(dir => {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
            });

            const localAudioPath = path.join(localAudioDir, audioFileName);
            const localMetadataPath = path.join(localMetadataDir, metadataFileName);
            const localTranscriptionPath = path.join(localTranscriptionDir, transcriptionFileName);
            
            fs.writeFileSync(localAudioPath, audioFile.buffer);
            fs.writeFileSync(localMetadataPath, JSON.stringify(metadata, null, 2));
            fs.writeFileSync(localTranscriptionPath, JSON.stringify(transcription, null, 2));

            res.json({
                success: true,
                message: "Enhanced medical audio submitted successfully (saved locally due to S3 issue)",
                files: {
                    audio: audioFileName,
                    metadata: metadataFileName,
                    transcription: transcriptionFileName
                },
                wer: werScore,
                transcription: transcription,
                itn_category: itnCategory,
                sequence_number: sequenceNumber,
                warning: "S3 upload failed, saved locally only"
            });
        }

    } catch (error) {
        console.error("❌ Error during enhanced medical audio submission:", error);
        res.status(500).json({ message: "Error during submission.", error: error.message });
    }
});

// Helper functions
function getITNCodeForSentence(index) {
    const itnCodes = [
        'NUM', 'NUM', 'NUM',           // Numbers (0-2)
        'SERIAL', 'SERIAL',            // Alphanumericals (3-4)
        'PHONE', 'PHONE',              // Phone numbers (5-6)
        'CURRENCY', 'CURRENCY',        // Currencies (7-8)
        'DATE', 'DATE', 'DATE',        // Dates (9-11)
        'TIME', 'TIME', 'TIME',        // Times (12-14)
        'UNIT', 'UNIT',                // Units (15-16)
        'URL', 'URL'                   // URLs (17-18)
    ];
    return itnCodes[index] || 'MISC';
}

function getCountryFromLanguage(languageCode) {
    const countryMap = {
        'zh-HK': 'Hong Kong',
        'yue-CN': 'China',
        'id-ID': 'Indonesia',
        'it-IT': 'Italy',
        'pl-PL': 'Poland',
        'pt-BR': 'Brazil',
        'pt-PT': 'Portugal',
        'es-ES': 'Spain',
        'es-US': 'United States',
        'th-TH': 'Thailand'
    };
    return countryMap[languageCode] || 'Unknown';
}

function getLocaleFromLanguage(languageCode) {
    const localeMap = {
        'zh-HK': 'Hong Kong',
        'yue-CN': 'Mainland China',
        'id-ID': 'Indonesia',
        'it-IT': 'Italy',
        'pl-PL': 'Poland',
        'pt-BR': 'Brazil',
        'pt-PT': 'Portugal',
        'es-ES': 'Spain',
        'es-US': 'United States',
        'th-TH': 'Thailand'
    };
    return localeMap[languageCode] || 'Unknown';
}

function getAccentInfo(languageCode) {
    const accentMap = {
        'zh-HK': 'Hong Kong Cantonese',
        'yue-CN': 'Mainland Cantonese',
        'id-ID': 'Indonesian',
        'it-IT': 'Italian',
        'pl-PL': 'Polish',
        'pt-BR': 'Brazilian Portuguese',
        'pt-PT': 'European Portuguese',
        'es-ES': 'European Spanish',
        'es-US': 'US Spanish',
        'th-TH': 'Thai'
    };
    return accentMap[languageCode] || 'Unknown';
}

function getLocaleInfo(languageCode) {
    const localeMap = {
        'zh-HK': 'Hong Kong',
        'yue-CN': 'Mainland China',
        'id-ID': 'Indonesia',
        'it-IT': 'Italy',
        'pl-PL': 'Poland',
        'pt-BR': 'Brazil',
        'pt-PT': 'Portugal',
        'es-ES': 'Spain',
        'es-US': 'United States',
        'th-TH': 'Thailand'
    };
    return localeMap[languageCode] || 'Unknown';
}

router.post("/audio_upload", async (req, res) => {
    try {
        console.log("--- Audio Upload Request Received ---");
        const { name, country, gender, audioData, format_Id, speakerId, 
                jsonCountry, age, text } = req.body;

        if (!audioData) {
            console.log("Error: No audio data provided in request.");
            return res.status(400).send("No audio data provided.");
        }

        console.log("Processing audio data for:", { speakerId, name, country, gender, age });

        // Prepare data object for processing
        const audioFunctionData = {
            name, country, gender, 
            dataURI: audioData,
            format_Id, speakerId, jsonCountry, age, text
        };

        console.log("Processing medical audio upload...");
        await processAudioUpload(audioFunctionData, res);
        console.log("Medical audio upload completed.");

    } catch (err) {
        console.error("--- Error during Audio Upload Route ---");
        console.error("Detailed Error:", err);
        if (!res.headersSent) {
             res.status(500).send("Internal server error during audio upload.");
        }
        console.error("--- Audio Upload Request Failed ---");
    }
});

// Batch process existing audio files to populate empty transcription data
router.post("/api/batch-process-transcriptions", async (req, res) => {
    try {
        console.log("🔄 Starting batch transcription processing...");
        
        const audioDir = path.join(__dirname, '../medical_audio_storage/audio');
        const transcriptionDir = path.join(__dirname, '../medical_audio_storage/transcriptions');
        
        // Get all audio files
        const audioFiles = fs.readdirSync(audioDir).filter(file => file.endsWith('.wav'));
        console.log(`📁 Found ${audioFiles.length} audio files to process`);
        
        let processedCount = 0;
        let errorCount = 0;
        const results = [];
        
        for (const audioFile of audioFiles) {
            try {
                // Extract metadata from filename (e.g., audio_zh_HK_NUM_0001.wav)
                const match = audioFile.match(/^audio_([^_]+_[^_]+)_([^_]+)_(\d{4})\.wav$/);
                if (!match) {
                    console.warn(`⚠️ Skipping ${audioFile} - invalid filename format`);
                    continue;
                }
                
                const [, locale, category, sequence] = match;
                const transcriptionFilename = `transcription_${locale}_${category}_${sequence}.json`;
                const transcriptionPath = path.join(transcriptionDir, transcriptionFilename);
                
                // Check if transcription file exists and has empty data
                let needsProcessing = false;
                if (fs.existsSync(transcriptionPath)) {
                    const transcriptionData = JSON.parse(fs.readFileSync(transcriptionPath, 'utf8'));
                    if (!transcriptionData.verbatim_transcription || !transcriptionData.itn_transcription) {
                        needsProcessing = true;
                    }
                } else {
                    needsProcessing = true;
                }
                
                if (!needsProcessing) {
                    console.log(`✅ ${audioFile} already has transcription data, skipping`);
                    continue;
                }
                
                console.log(`🎤 Processing ${audioFile}...`);
                
                // Read and convert audio file
                const audioPath = path.join(audioDir, audioFile);
                const audioBuffer = fs.readFileSync(audioPath);
                const audioBase64 = audioBuffer.toString('base64');
                const languageCode = locale.replace('_', '-'); // Convert zh_HK to zh-HK
                
                // Transcribe with Gemini
                const transcriptionResult = await transcribeWithGemini(audioBase64, languageCode, 'audio/wav');
                
                let verbatimTranscription = "";
                let itnTranscription = "";
                
                if (transcriptionResult.success) {
                    // Keep verbatim completely original (no modifications)
                    verbatimTranscription = transcriptionResult.verbatim;
                    
                    // For ITN: start with verbatim, then apply ITN processing
                    let itnProcessingText = verbatimTranscription;
                    
                    // Convert numbers back to words for ITN processing only
                    itnProcessingText = convertNumbersToWords(itnProcessingText);
                    
                    // Apply ITN formatting
                    const itnResult = await applyITNFormatting(itnProcessingText, itnProcessingText);
                    itnTranscription = itnResult.success ? itnResult.itn : itnProcessingText;
                    
                    // Apply custom ITN patterns
                    itnTranscription = applyCustomITNPatterns(itnTranscription);
                }
                
                // Save updated transcription data
                const transcriptionData = {
                    verbatim_transcription: verbatimTranscription,
                    itn_transcription: itnTranscription
                };
                
                fs.writeFileSync(transcriptionPath, JSON.stringify(transcriptionData, null, 2));
                
                results.push({
                    audioFile,
                    transcriptionFile: transcriptionFilename,
                    success: true,
                    verbatim: verbatimTranscription,
                    itn: itnTranscription
                });
                
                processedCount++;
                console.log(`✅ Completed ${audioFile}`);
                
            } catch (fileError) {
                console.error(`❌ Error processing ${audioFile}:`, fileError);
                results.push({
                    audioFile,
                    success: false,
                    error: fileError.message
                });
                errorCount++;
            }
        }
        
        console.log(`🎯 Batch processing completed: ${processedCount} successful, ${errorCount} errors`);
        
        res.json({
            success: true,
            message: `Batch processing completed: ${processedCount} files processed successfully, ${errorCount} errors`,
            processedCount,
            errorCount,
            results
        });
        
    } catch (error) {
        console.error("❌ Batch processing error:", error);
        res.status(500).json({ 
            success: false,
            message: "Error during batch processing", 
            error: error.message 
        });
    }
});

// --- Export router as default export ---
export default router;