# S3 Integration and UI Updates - Implementation Summary

## Overview
This document outlines the recent updates to the audio sourcing application, including S3 bucket integration, UI improvements, and file naming convention changes.

## Major Changes Implemented

### 1. UI Layout Improvements
- **3-Column Layout**: Restructured the interface with left panel (speaker info), center panel (content/waveform), and right panel (control buttons)
- **Button Organization**: Control buttons arranged in 2 rows in the right panel
  - Row 1: Start and Pause buttons
  - Row 2: Listen, Rerecord, and Submit buttons
- **Dynamic Button States**: Buttons enable/disable based on recording status and WER satisfaction

### 2. Form Field Updates
- **Removed Fields**: Speaker code and age group fields (auto-generated and calculated)
- **Added Field**: Frequency selection dropdown with 8kHz and 16kHz options
- **Updated Validation**: Form validation now includes frequency selection

### 3. S3 Bucket Integration
- **Bucket Name**: `audio-sourcing-itn`
- **Folder Structure**:
  - `original/`: Contains original audio files and metadata
  - `modified/`: Contains frequency-converted audio files
- **File Naming Convention**: 
  - Audio files: `audio_countrycode_ITN_sequence.wav` (e.g., `audio_zh_HK_ITN_0001.wav`)
  - Metadata files: `metadata_countrycode_ITN_sequence.json`

### 4. Backend Updates
- **AWS S3 Integration**: Real S3 upload instead of local file simulation
- **Automatic Sequence Generation**: ITN sequence numbers auto-increment based on existing files
- **Metadata Enhancement**: Updated metadata structure to include ITN sequences and S3 paths

## File Changes

### Frontend Files Modified
1. **views/index.pug**
   - Restructured to 3-column layout
   - Removed speaker code and age group fields
   - Added frequency dropdown
   - Updated button arrangement

2. **public/mainFunction/medical-recorder-enhanced.js**
   - Updated form validation to include frequency
   - Removed speaker code generation logic
   - Removed age group calculation functions
   - Added S3 path generation functions
   - Enhanced button enable/disable logic

### Backend Files Modified
1. **app_uvicorn.py**
   - Added boto3 S3 client integration
   - Updated form validation fields
   - Implemented S3 upload functions
   - Added ITN sequence generation
   - Updated metadata structure
   - Modified file naming convention

2. **.env.example**
   - Added AWS S3 configuration variables
   - Documented bucket structure and naming conventions

## Setup Instructions

### 1. AWS S3 Configuration
1. Create or access the S3 bucket: `audio-sourcing-itn`
2. Set up proper IAM permissions for bucket access
3. Update your `.env` file with AWS credentials:
   ```
   AWS_ACCESS_KEY_ID=your-aws-access-key-id
   AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
   AWS_REGION=us-east-1
   ```

### 2. Dependencies
Ensure boto3 is installed (already included in requirements.txt):
```bash
pip install boto3
```

### 3. Bucket Structure
The S3 bucket will automatically organize files as:
```
audio-sourcing-itn/
├── original/
│   ├── audio_zh_HK_ITN_0001.wav
│   ├── metadata_zh_HK_ITN_0001.json
│   └── ...
└── modified/
    ├── audio_zh_HK_ITN_0001.wav (frequency converted)
    └── ...
```

## API Changes

### Updated Form Fields
- **Removed**: `speakerCode`, `ageGroup`, `targetFrequency`
- **Added**: `frequency`
- **Maintained**: `speakerId`, `speakerName`, `speakerGender`, `speakerAge`, `locale`, `deviceType`, `sentenceId`, `sentenceText`

### Response Format
The API response now includes S3 paths instead of local file paths:
```json
{
  "message": "Audio submitted successfully",
  "submission_id": "abc12345",
  "validation_status": true,
  "file_paths": {
    "original_audio": "s3://audio-sourcing-itn/original/audio_zh_HK_ITN_0001.wav",
    "modified_audio": "s3://audio-sourcing-itn/modified/audio_zh_HK_ITN_0001.wav",
    "metadata": "s3://audio-sourcing-itn/original/metadata_zh_HK_ITN_0001.json"
  }
}
```

## Technical Features

### 1. Automatic Sequence Generation
- Scans existing S3 files to find the next available ITN sequence number
- Prevents file conflicts and ensures unique naming
- Format: 4-digit zero-padded numbers (0001, 0002, etc.)

### 2. Frequency Conversion
- Original audio stored in `original/` folder
- Frequency-converted audio stored in `modified/` folder
- Supports both 8kHz and 16kHz target frequencies

### 3. Enhanced Metadata
- Complete speaker information
- Audio analysis results
- S3 file paths
- ITN sequence tracking
- Timestamp and submission ID

## Testing
1. Ensure AWS credentials are properly configured
2. Test with different locale codes (e.g., zh_HK, en_US)
3. Verify S3 uploads are successful
4. Check sequence number increment functionality
5. Validate frequency conversion process

## Notes
- The application now requires valid AWS credentials to function
- File naming follows the ITN convention for compatibility
- Both original and frequency-converted files are stored for flexibility
- MongoDB records include S3 paths for easy retrieval
