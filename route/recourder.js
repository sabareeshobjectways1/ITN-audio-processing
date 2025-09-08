
import express from 'express';
import AudioData from '../models/audioData.js'; // Assuming your Mongoose model is in models/audioModel.js
const router = express.Router();

router.get('/get_speaker_ids', async (req, res) => {
    const { format_Id, jsonCountry } = req.query; // Get format_Id and jsonCountry from query parameters

    if (!format_Id || !jsonCountry) {
        return res.status(400).json({ message: 'format_Id and jsonCountry are required' });
    }

    try {
        const speakerIds = await AudioData.distinct('speakerId', { // Use distinct to get unique speakerIds
            speakerid: format_Id,
            country: jsonCountry,
            validation_status: true
        });

        if (speakerIds.length === 0) {
            return res.status(404).json({ message: 'No speakerIds found for given criteria' });
        }

        res.json(speakerIds); // Return an array of speakerIds
    } catch (error) {
        console.error('Error fetching speakerIds:', error);
        res.status(500).json({ message: 'Failed to fetch speakerIds', error: error.message });
    }
});
// Route to fetch validated texts based on format_Id and jsonCountry
router.get('/re-record/:format_id/:jsoncountry', async (req, res) => {

    // Correctly access path parameters using req.params
    const format_Id = req.params.format_id;
    const jsonCountry = req.params.jsoncountry;

    console.log("Index route hit - format_id:", format_Id, "jsoncountry:", jsonCountry);
    if (!format_Id || !jsonCountry) {
        return res.render('newIndex', { texts: [], message: 'Please provide format ID and country.' }); // Render with empty texts and a message
    }

    try {
        const validatedTexts = await AudioData.find({
            speakerid: format_Id,
            country: jsonCountry,
            validation_status: true
        }).select('speed text speakerId id').sort({ _id: 1 }); // Select necessary fields and sort by _id to maintain order

        console.log("Validated texts:", validatedTexts); // Log the validated texts
        

        if (validatedTexts.length === 0) {
            return res.render('newIndex', { texts: [], message: 'No validated texts found for selected criteria.' }); // Render with empty texts and a message
        }

        // *** Pass validatedTexts to the Pug template ***
        res.render('newIndex', { texts: validatedTexts, message: null }); // Pass texts and no message
    } catch (error) {
        console.error('Error fetching validated texts:', error);
        res.status(500).render('newIndex', { texts: [], message: 'Error fetching texts from database.' }); // Render with empty texts and error message
    }
});
router.get('/get_validated_texts', async (req, res) => {
    const { format_Id, jsonCountry } = req.query; // Get format_Id and jsonCountry from query parameters

    if (!format_Id || !jsonCountry) {
        return res.status(400).json({ message: 'format_Id and jsonCountry are required' });
    }

    try {
        const validatedTexts = await AudioData.find({
            speakerid: format_Id,
            country: jsonCountry,
            validation_status: true
        }).select('speed text speakerId id').sort({ _id: 1 }); // Select necessary fields and sort by _id to maintain order

        if (validatedTexts.length === 0) {
            return res.status(404).json({ message: 'No validated texts found for given criteria' });
        }

        res.json(validatedTexts);
    } catch (error) {
        console.error('Error fetching validated texts:', error);
        res.status(500).json({ message: 'Failed to fetch validated texts', error: error.message });
    }
});

// Route to update audio data (assuming you want to update based on speakerId_sequence and speed)
router.put('/audio_uploade', async (req, res) => { // Changed to PUT for update
    const audioData = req.body;

    if (!audioData.speakerId_sequence || !audioData.speed) {
        return res.status(400).json({ message: 'speakerId_sequence and speed are required for update' });
    }

    try {
        const updatedDocument = await AudioData.findOneAndUpdate(
            { speakerId_sequence: audioData.speakerId_sequence, speed: audioData.speed }, // Find document by speakerId_sequence and speed
            {
                $set: { // Use $set to update fields
                    audioData: audioData.audioData, // Base64 audio data
                    name: audioData.name,
                    gender: audioData.gender,
                    age: audioData.age,
                    country: audioData.country,
                    jsonCountry: audioData.jsonCountry,
                    text: audioData.text,
                    // You can add other fields you want to update here, like recording timestamp etc.
                }
            },
            { new: true } // Return the modified document
        );

        if (!updatedDocument) {
            return res.status(404).json({ message: 'Audio data not found for update' });
        }

        res.json({ message: 'Audio data updated successfully', updatedDocument });
        // Or you can just send a success message like before:
        // res.send("Audio data uploaded successfully!");

    } catch (error) {
        console.error('Error updating audio data:', error);
        res.status(500).json({ message: 'Failed to update audio data', error: error.message });
    }
});


export default router;