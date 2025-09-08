// Test script for batch transcription processing
// This script demonstrates how to call the batch processing endpoint

const fetch = require('node-fetch');

async function testBatchProcessing() {
    try {
        console.log('🧪 Testing batch transcription processing...');
        
        const response = await fetch('http://localhost:3000/api/batch-process-transcriptions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('✅ Batch processing completed successfully!');
            console.log(`📊 Processed: ${result.processedCount} files`);
            console.log(`❌ Errors: ${result.errorCount} files`);
            
            if (result.results && result.results.length > 0) {
                console.log('\n📋 Results:');
                result.results.forEach((item, index) => {
                    if (item.success) {
                        console.log(`${index + 1}. ✅ ${item.audioFile}`);
                        console.log(`   📝 Verbatim: "${item.verbatim}"`);
                        console.log(`   🔧 ITN: "${item.itn}"`);
                    } else {
                        console.log(`${index + 1}. ❌ ${item.audioFile}: ${item.error}`);
                    }
                });
            }
        } else {
            console.error('❌ Batch processing failed:', result.message);
        }
        
    } catch (error) {
        console.error('💥 Test failed:', error.message);
    }
}

// Run the test if this script is executed directly
if (require.main === module) {
    testBatchProcessing();
}

module.exports = { testBatchProcessing };
