// Example demonstrating the difference between verbatim and ITN transcriptions

const exampleTranscriptions = [
    {
        audio_description: "Speaker says numbers as digits",
        verbatim_transcription: "I need 5 million dollars for this project",
        itn_transcription: "I need <ITN:NUM>5000000</ITN:NUM> dollars for this project"
    },
    {
        audio_description: "Speaker gives address",
        verbatim_transcription: "Meet me at 123 Main Street apartment 2B",
        itn_transcription: "Meet me at <ITN:ADDRESS>123 Main St Apt 2B</ITN:ADDRESS>"
    },
    {
        audio_description: "Speaker gives phone number",
        verbatim_transcription: "Call me at 8 2 6 9 2 4 1 1 8 2",
        itn_transcription: "Call me at <ITN:PHONE>(826) 924-1182</ITN:PHONE>"
    },
    {
        audio_description: "Speaker mentions date",
        verbatim_transcription: "The deadline is April 20th",
        itn_transcription: "The deadline is <ITN:DATE>April 20th</ITN:DATE>"
    },
    {
        audio_description: "Speaker mentions time",
        verbatim_transcription: "Meet me at 8:30 in the morning",
        itn_transcription: "Meet me at <ITN:TIME>8:30</ITN:TIME> in the morning"
    },
    {
        audio_description: "Speaker mentions currency",
        verbatim_transcription: "It costs 200 dollars",
        itn_transcription: "It costs <ITN:CURRENCY>$200</ITN:CURRENCY>"
    }
];

console.log('🎤 TRANSCRIPTION EXAMPLES - VERBATIM vs ITN\n');

exampleTranscriptions.forEach((example, index) => {
    console.log(`${index + 1}. ${example.audio_description}`);
    console.log(`   📝 Verbatim: "${example.verbatim_transcription}"`);
    console.log(`   🔧 ITN:      "${example.itn_transcription}"`);
    console.log('');
});

console.log('✅ Key Differences:');
console.log('📝 VERBATIM: Original speech, exactly as spoken (no modifications)');
console.log('🔧 ITN: Formatted with semantic labels for entities like numbers, addresses, etc.');

module.exports = { exampleTranscriptions };
