
window.AudioContext = window.AudioContext || window.webkitAudioContext;

let timerInterval;
let seconds = 0;
let minutes = 0;
let nameSequenceMap = {};
let texts = []; // Initialize texts as an empty array
let currentAudio = 0; // Initialize currentAudio to 0
let speakerIds = [];

var API_URL = null ; 

// Function to handle redirection after form completion

$(document).ready(function() {
    $('#userId, #userName, #userGender, #userCountry, #userAge').prop('disabled', true);
});


function startTimer() {
    seconds = 0;
    minutes = 0;
    updateTimerDisplay();
    timerInterval = setInterval(updateTimer, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
}

function updateTimer() {
    seconds++;
    if (seconds >= 60) {
        seconds = 0;
        minutes++;
    }
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const timerElement = document.getElementById('timer');
    timerElement.textContent = `${padZero(minutes)}:${padZero(seconds)}`;
}

function padZero(num) {
    return num.toString().padStart(2, '0');
}

function showAudioControls() {
    // document.getElementById('audioPlayback').classList.remove('hidden');
    document.getElementById('timer').classList.remove('hidden');
}

function hideAudioControls() {
    // document.getElementById('audioPlayback').classList.add('hidden');
    document.getElementById('timer').classList.add('hidden');
}

function saveAudio() {
    // audioRecorder.exportWAV( doneEncoding );
    // could get mono instead by saying
    audioRecorder.exportMonoWAV( doneEncoding );
}

function gotBuffers( buffers ) {
    var canvas = document.getElementById( "wavedisplay" );

    drawBuffer( canvas.width, canvas.height, canvas.getContext('2d'), buffers[0] );

    // the ONLY time gotBuffers is called is right after a new recording is completed -
    // so here's where we should set up the download.
    // audioRecorder.exportWAV( doneEncoding );
    audioRecorder.exportMonoWAV( doneEncoding );
}
function parseWAVInfo(blob) {
    const reader = new FileReader();
    reader.onload = function() {
        const buffer = new DataView(reader.result);

        // Extract WAV header info
        const numChannels = buffer.getUint16(22, true);
        const sampleRate = buffer.getUint32(24, true);
        const bitsPerSample = buffer.getUint16(34, true);
        const dataSize = buffer.getUint32(40, true);
        const durationSec = dataSize / (sampleRate * numChannels * (bitsPerSample / 8));

        const duration = formatDuration(durationSec);
        const fileSizeKB = (blob.size / 1024).toFixed(1);
        const bitrate = ((sampleRate * bitsPerSample * numChannels) / 1000).toFixed(2); // in kbps
        const sampleEncoding = `${bitsPerSample}-bit Signed Integer PCM`;

        // Log in the format you want
        console.log(`Channels       : ${numChannels}`);
        console.log(`Sample Rate    : ${sampleRate}`);
        console.log(`Precision      : ${bitsPerSample}-bit`);
        console.log(`Duration       : ${duration} = ${dataSize} samples`);
        console.log(`File Size      : ${fileSizeKB}k`);
        console.log(`Bit Rate       : ${bitrate}k`);
        console.log(`Sample Encoding: ${sampleEncoding}`);
    };
    reader.readAsArrayBuffer(blob);
}
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 100);
    return `${padZero(mins)}:${padZero(secs)}.${padZero(millis)}`;
}

function doneEncoding( blob ) {
    parseWAVInfo(blob);
    Recorder.setupDownload( blob, "myRecording" + ((recIndex<10)?"0":"") + recIndex + ".wav", function(durl){
        window.dataURI = durl;
        fetch(durl)
        .then(res => res.blob())
        .then(blob => {
            window.testBlob = blob;
            $('.audio').remove();
            var aurl = (window.URL || window.webkitURL).createObjectURL(testBlob);
            var audio = $('<AUDIO controls>').prop('src',aurl).prop('type',"audio/wav").addClass('audio');

            $('#media').html();
            $('#media').append(audio);
        })

    } );

    recIndex++;
}
function updateLocalStorage() {
    localStorage.setItem('globalNameSequence', globalNameSequence);
    localStorage.setItem('globalSpeakerSequence', globalSpeakerSequence);
}
function generateSpeakerId(gender, sequence, difficulty) {
    let genderCode = 'S';
    let sequenceNumber = sequence.toString().padStart(4, '0');  // Pads sequence with leading zeros, e.g., '0001'
    return genderCode + sequenceNumber;
}
try {
    console.log('nameSequenceMap before processing:', nameSequenceMap);

    if (nameSequenceMap && typeof nameSequenceMap === 'object') {
        Object.keys(nameSequenceMap).forEach(function(name) {
            var sequence = localStorage.getItem('nameSequence_' + name);
            console.log(`Checking name: ${name}, Sequence from localStorage: ${sequence}`);
            if (sequence) {
                nameSequenceMap[name] = sequence;
            }
        });
    } else {
        console.error('nameSequenceMap is not initialized or not an object');
    }
} catch (e) {
    console.error('Error retrieving sequences from localStorage:', e);
}
function setupEventListeners() {
    // Save form state when input changes
    $('#userId, #userName, #userGender, #userCountry, #userAge').on('change input', function() {
        saveFormState();
        saveState();
    });

    // Save state before page unload
    $(window).on('beforeunload', function() {
        saveFormState();
        saveState();
    });
}
function saveFormState() {
    try {
        const formData = {
            userId: $('#userId').val(),
            userName: $('#userName').val(),
            userGender: $('#userGender').val(),
            userCountry: $('#userCountry').val(),
            userAge: $('#userAge').val()
        };
        localStorage.setItem('formData', JSON.stringify(formData));
        console.log('Form data saved:', formData);
    } catch (error) {
        console.error('Error saving form data:', error);
    }
}

async function loadTextsAndUpdateDisplay() {
    const pathSegments = window.location.pathname.split('/'); // Split pathname by '/'
    const format_Id = pathSegments[2];  // Assuming format_id is the 3rd segment (after /index/)
    const jsonCountry = pathSegments[3]; // Assuming jsoncountry is the 4th segment

    if (!format_Id || !jsonCountry) {
        console.warn("Format ID or Country not found in URL path.");
        texts = [];
        currentAudio = 0;
        updateDisplay();
        return;
    }

    await loadValidatedTextsFromServer(format_Id,jsonCountry)
    .then(data => {
        if (data && data.length > 0) {
            texts = data;
            currentAudio = 0;
            updateDisplay();
            console.log("Texts updated dynamically for Format ID:", format_Id_initial, "Country:", jsonCountry);
        } else {
            console.log("No validated texts found for selected criteria.");
            texts = [];
            currentAudio = 0;
            updateDisplay();
        }
    })
    .catch(error => {
        console.error("Error fetching validated texts:", error);
        alert("Failed to load texts dynamically. Please check console.");
    });
}

function initializeApp() {
    // First load any saved state
    loadSavedState();
    
    // Then set up event listeners
    setupEventListeners();

    // updateDisplay();
    // Load texts initially based on URL parameters if available on page load
    const pathSegments = window.location.pathname.split('/');
    const format_Id_initial = pathSegments[2];
    const jsonCountry_initial = pathSegments[3];

    if (format_Id_initial && jsonCountry_initial) {
        $('#userId').val(format_Id_initial); // Optionally pre-fill form fields from URL
        $('#userCountry').val(jsonCountry_initial);

        loadValidatedTextsFromServer(format_Id_initial,jsonCountry_initial)
        .then(data => {
            if (data && data.length > 0) {
                texts = data;
                currentAudio = 0;
                updateDisplay();
                console.log("Texts updated dynamically for Format ID:", format_Id_initial);
            } else {
                console.log("No validated texts found for selected criteria.");
                texts = [];
                currentAudio = 0;
                updateDisplay();
            }
        })
        .catch(error => {
            console.error("Error fetching validated texts:", error);
            alert("Failed to load texts dynamically. Please check console.");
        });
    } else {
        console.warn("Format ID or Country not in URL on initial load. Texts not fetched yet.");
        updateDisplay();
    }
}


function loadFormState() {
    try {
        const formDataString = localStorage.getItem('formData');
        if (formDataString) {
            const formData = JSON.parse(formDataString);
            $('#userId').val(formData.userId || '');
            $('#userName').val(formData.userName || '');
            $('#userGender').val(formData.userGender || '');
            $('#userCountry').val(formData.userCountry || '');
            $('#userAge').val(formData.userAge || '');
        }
    } catch (error) {
        console.error('Error loading form data:', error);
    }
}
function loadSavedState() {
    try {
        // Load form data first
        loadFormState();

        // Load other state variables
        currentAudio = parseInt(localStorage.getItem('currentAudio')) || 0;
        currentDifficulty = localStorage.getItem('currentDifficulty') || 'comfortable_slow'; // This is likely not used anymore, but kept for now.
        globalSequence = parseInt(localStorage.getItem('globalSequence')) || 1;
        globalNameSequence = parseInt(localStorage.getItem('globalNameSequence')) || 1;
        globalSpeakerSequence = parseInt(localStorage.getItem('globalSpeakerSequence')) || 1;

        const savedNameSequenceMap = localStorage.getItem('nameSequenceMap');
        nameSequenceMap = savedNameSequenceMap ? JSON.parse(savedNameSequenceMap) : {};

        console.log('Loaded state:', {
            currentAudio,
            currentDifficulty,
            globalSequence,
            globalNameSequence,
            globalSpeakerSequence
        });
    } catch (error) {
        console.error('Error loading saved state:', error);
        initializeDefaultState();
    }
}

// Add this JavaScript function
function clearAllData() {
    try {
        // Clear localStorage
        localStorage.clear();

        // Clear all cookies
        document.cookie.split(";").forEach(function(c) {
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });

        // Reset all form fields
        $('#userId, #userName, #userGender, #userCountry, #userAge').val('');

        // Reset all global variables
        currentAudio = 0;
        currentDifficulty = 'comfortable_slow';
        globalSequence = 1;
        globalNameSequence = 1;
        globalSpeakerSequence = 1;
        nameSequenceMap = {};

        // Hide all audio-related elements
        $('#record').hide();
        $('#save').hide();
        $('#analyser').hide();
        $('#wavedisplay').hide();
        $('.audio').remove();

        // Update the display
        updateDisplay();

        // Show success message
        alert('All data has been cleared successfully!');

        // Optional: Reload the page to ensure a fresh start
        window.location.reload();

    } catch (error) {
        console.error('Error clearing data:', error);
        alert('Error occurred while clearing data');
    }
}
$(document).ready(function() {
    initializeApp();
    // updateDisplay();

    $('#clearAllData').on('click', function() {
        if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
            clearAllData();
        }
    });

});
function doneMove() {
    const format_Id = $('#userId').val().trim(); // Get format_Id from input field
    const jsonCountry = $('#userCountry').val().trim(); // Get jsonCountry from select

    if (format_Id && jsonCountry) {
        window.location.href = `/re-record/${format_Id}/${jsonCountry}`; // Redirect to /index with path params
    } else {
        alert("Please enter Speaker ID and Country before proceeding."); // Or handle as needed
    }
}

function sendAudio() {
    var data = dataURI;
    var speakerId = $('#userId').val().trim();
    var name = $('#userName').val().trim();
    var gender = $('#userGender').val().trim();
    var country = $('#userCountry').val().trim();
    var age = $('#userAge').val().trim() * 1;

    var audioId = texts[currentAudio].id;
    var speed = texts[currentAudio].speed; // Get speed from texts array
    var textToSend = texts[currentAudio].text; // Get text from texts array;

    var ageRange;

    if (age < 18) {
        ageRange = 'A';
    } else if (age >= 18 && age <= 24) {
        ageRange = 'B';
    } else if (age >= 25 && age <= 29) {
        ageRange = 'C';
    } else if (age >= 30 && age <= 35) {
        ageRange = 'D';
    } else {
        ageRange = 'E'; // Handle cases where age is not within specified ranges
    }
    if (speakerId === '') {
        alert('Please fill in your Speaker Id');
        return $('#userId').focus();
    }
    if (name === '') {
        alert('Please fill in your name');
        return $('#userName').focus();
    }
    if (gender === '') {
        alert('Please select your gender');
        return $('#userGender').focus();
    }
    if (!age) {
        alert('Please fill in your age');
        return $('#userAge').focus();
    }
    if (age > 200) {
        alert('Please check your age,Once again !');
        return $('#userAge').focus();
    }
    if (country === '') {
        alert('Please select your country');
        return $('#userCountry').focus();
    }

    let genderFormat = gender.toLowerCase();
    var speakerId_sequence = speakerId + '_' + generateSpeakerId(gender, globalSpeakerSequence, texts[currentAudio].speed); // Use current text speed

    updateLocalStorage();

    const countryLanguageMap = {
        "India": "en-in",
        "UK": "en-uk",
        "US": "en-us",
        "Canada": "en-ca",
        "Australia": "en-au"
        // Add more country-language mappings as needed
    };
    const languageCode = countryLanguageMap[country]
    $('#mymodal').modal({ backdrop: 'static' }).find('.modal-footer').hide();
    $('#mymodal').find('.modal-header').hide();
    $('#mymodal').find('.modal-body').html('<div class="spinner-border text-secondary spinner-border-sm" role="status"><span class="sr-only">Loading...</span></div> Sending Audio File...');

    console.log("JSONNNNNNN",{speakerId: speakerId,
        name: name,
        gender: gender,
        age: ageRange,
        country: country,
        id: audioId,
        speakerId_sequence:speakerId_sequence,
        speed: speed,
        text: textToSend,
        dataURI: data,
    });
    const speakerIdParts = texts[currentAudio].speakerId_sequence;
    console.log('speakerIdParts--->',speakerIdParts);

    

    $.get('/env', function (env) {
        const API_URL = `${env.API_URL}`;
        var data_send = {
            speakerId: speakerId,
            name: name,
            gender: gender,
            age: ageRange,
            country: country,
            id: audioId,
            speakerId_sequence:speakerIdParts,
            speed: speed,
            text: textToSend,
            dataURI: data,
        };
    //dhinesh python send data
    fetch(`${API_URL}/resave_audio`, {  // Update with your backend URL
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data_send)
    })
    .then(response => response.json())
    .then(result => {
        console.log('Success:', result);
    })
    .catch(error => {
        console.error('Error:', error);
    });
})


    console.log("JSONNNNNNN",{speakerId: speakerIdParts,
        format_Id: speakerId,
        name: name,
      //   correction:true,
        gender: genderFormat,
        age: ageRange,
        jsonCountry: languageCode,
        country: country,
        id: audioId,
        speakerId_sequence: speakerIdParts,
        speed: speed,
        text: textToSend,
        audioData: data,
    });
    





    $.ajax({
        url: "/audio_upload",
        type: "POST",
        data: JSON.stringify({
          speakerId: speakerIdParts,
          format_Id: speakerId,
          name: name,
        //   correction:true,
          gender: genderFormat,
          age: ageRange,
          jsonCountry: languageCode,
          country: country,
          id: audioId,
          speakerId_sequence: speakerIdParts,
          speed: speed,
          text: textToSend,
          audioData: data, // Base64 Audio Data - Make sure this is uncommented and correct
        }),
        contentType: "application/json",
        processData: false,
        success: function (res) {
            console.log("Data uploaded successfully:", res);
            console.log("Inside success condition check:", res === "Audio data uploaded successfully!");
            if (res === "Audio data uploaded successfully!") {
            // Proceed to next audio
            $("#loadingIndicator").hide();
            $("#mymodal").modal("hide");
            globalSequence++;
            globalSpeakerSequence++;
            saveState();
            nextAudio(); // Move to the next audio
          } else {
            alert("Some error occurred while saving the audio. Please try again.");
          }
        },
        error: function (xhr, status, error) {
          console.error("Error uploading data:", error);
          alert("Error uploading data. Please try again.");
        },
      });


}



async function loadValidatedTextsFromServer(format_Id,country) {

    console.log('validatedText--->',format_Id,country);
    const url = `https://audio-sourcing.objectways.com/app2/checkdata/${format_Id}/${country}`;
    const response = await fetch(url, {
        method: 'GET'
    });
    if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
    }
    return await response.json();
}

async function nextAudio() {
    console.log("Moving to the next audio...");
    $('#save').hide();
    $('#analyser').hide();
    $('#wavedisplay').hide();
    $('#alert').show();
    $('.audio').remove();
    $('#record').text('Start Recording');
    initAudio()
    // *** SIMPLIFIED Difficulty Progression - No more complex difficulty logic here ***
    // We are now assuming the backend provides texts in the desired order
    currentAudio++; // Just increment currentAudio to move to the next text

    saveState();

    const format = $('#userId').val().trim();
    const json = $('#userCountry').val().trim();

    if (!format || !json) {
        console.warn("Format ID or Country not selected. Cannot fetch texts.");
        return;
    }

    if (currentAudio < texts.length) { // Check if currentAudio is still within the texts array
        updateDisplay();
        loadNextAudioData(); // Keep this line if needed for other audio data loading
    } else {
        console.log("No more validated texts in the current set. Audio recording completed for this set.");
        await fetchFailedValidations();
    }
}


function saveState() {
    try {
        localStorage.setItem('currentAudio', currentAudio);
        localStorage.setItem('currentDifficulty', currentDifficulty); // Likely not used anymore
        localStorage.setItem('globalSequence', globalSequence);
        localStorage.setItem('globalNameSequence', globalNameSequence);
        localStorage.setItem('globalSpeakerSequence', globalSpeakerSequence);
        localStorage.setItem('nameSequenceMap', JSON.stringify(nameSequenceMap));

        // Also save form state
        saveFormState();

        console.log('State saved:', {
            currentAudio,
            currentDifficulty,
            globalSequence,
            globalNameSequence,
            globalSpeakerSequence
        });
    } catch (error) {
        console.error('Error saving state:', error);
    }
}

// Modified loadState function to handle missing data
function loadState() {
    try {
        const savedAudio = localStorage.getItem('currentAudio');
        const savedDifficulty = localStorage.getItem('currentDifficulty'); // Likely not used anymore
        const savedGlobalSequence = localStorage.getItem('globalSequence');
        const savedGlobalNameSequence = localStorage.getItem('globalNameSequence');
        const savedGlobalSpeakerSequence = localStorage.getItem('globalSpeakerSequence');
        const savedNameSequenceMap = localStorage.getItem('nameSequenceMap');

        currentAudio = savedAudio !== null ? parseInt(savedAudio) : 0;
        currentDifficulty = savedDifficulty || 'comfortable_slow'; // Default value, likely not used
        globalSequence = savedGlobalSequence !== null ? parseInt(savedGlobalSequence) : 1;
        globalNameSequence = savedGlobalNameSequence !== null ? parseInt(savedGlobalNameSequence) : 1;
        globalSpeakerSequence = savedGlobalSpeakerSequence !== null ? parseInt(savedGlobalSpeakerSequence) : 1;
        nameSequenceMap = savedNameSequenceMap ? JSON.parse(savedNameSequenceMap) : {};

        // Update display after loading state
        updateDisplay();
    } catch (error) {
        console.error('Error loading state:', error);
        // Initialize with default values if there's an error
        initializeDefaultState();
    }
}


async function updateDisplay() {
    try {
        console.log('updateDisplay--->', texts);
        if (!texts || texts.length === 0) {
            console.log('No data in texts array. Exiting function.');
            $('#record').hide();
            $('#save').hide();
            $('#analyser').hide();
            $('#wavedisplay').hide();
            $('.audio').remove();
            $('#title').hide();
            $('#alert').hide();
            $('#texttorec').hide();
            $('#done').text("Thanking You");
            $('#done').show();
            return;
        }

        if (texts[currentAudio]) { // Check if text exists at currentAudio index
            const formattedDifficulty = texts[currentAudio].speed;
            const currentSpeakerId = texts[currentAudio].speakerid;
            const speakerIdParts = texts[currentAudio].speakerId_sequence;
            const country = texts[currentAudio].country;
            const name = texts[currentAudio].name;
            const gender = texts[currentAudio].gender;
            const age = texts[currentAudio].age;
            if (age === 'A') {
                age_c = 18;
            } else if (age === 'B') {
                age_c = 20; // midpoint of 18–24
            } else if (age === 'C') {
                age_c = 27; // midpoint of 25–29
            } else if (age === 'D') {
                age_c = 32; // midpoint of 30–35
            } else if (age === 'E') {
                age_c = 36; // minimum age above 35
            }
            
            // Set values 
            $('#userId').val(currentSpeakerId);
            $('#userName').val(name);
            $('#userGender').val(gender);
            $('#userCountry').val(country);
            $('#userAge').val(age_c);

            let formatIdPart = currentSpeakerId;
            let sequenceIdPart = speakerIdParts;

            $('#title').html([
                'Text', currentAudio + 1, 'of', texts.length, '-', 
                'Please Read the sentence', formattedDifficulty, 
                'and record the following sentence'
            ].join(' '));

            $('#texttorec').html(
                texts[currentAudio].text + 
                ' <em style="color: gray;">-' + formattedDifficulty + '</em>'
            );

            console.log("Current Text Speaker ID:", currentSpeakerId);
            console.log("Format ID Part:", formatIdPart);
            console.log("Sequence ID Part:", sequenceIdPart);
            console.log("Country:", country);
            console.log("Name",name);
            console.log("Gender",gender);
            console.log("Gender",age);

        } else {
            console.warn('No text found for current position:', currentAudio);
            await fetchFailedValidations();
        }
    } catch (error) {
        console.error('Error updating display:', error);
    }
}

function initializeDefaultState() {
    currentAudio = 0;
    currentDifficulty = 'comfortable_slow';
    globalSequence = 1;
    globalNameSequence = 1;
    globalSpeakerSequence = 1;
    nameSequenceMap = {};
    updateDisplay();
}
function clearAllSavedState() {
    try {
        localStorage.clear(); // Clear all localStorage data
        initializeDefaultState();
        $('#userId, #userName, #userGender, #userCountry, #userAge').val(''); // Clear form fields
    } catch (error) {
        console.error('Error clearing state:', error);
    }
}
$.get('/env', function (env) {
    API_URL = `${env.API_URL}`;
})
//dhinesh python send data
async function fetchFailedValidations() {
    try {
        var speakerId = $('#userId').val().trim(); 
        const country = $('#userCountry').val().trim(); 
        // const url = `http://localhost:7000/checkfails/${encodeURIComponent(speakerId)}`;
        const url = `https://audio-sourcing.objectways.com/app2/checkfails/${encodeURIComponent(speakerId)}/${encodeURIComponent(country)}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('checkfails--->',data);
        if (data.length === 0) {
            audioDone();
        } else {
            $('#record').hide();
            $('#save').hide();
            $('#analyser').hide();
            $('#wavedisplay').hide();
            $('.audio').remove();
            $('#title').hide();
            $('#alert').hide();
            $('#texttorec').hide();
            $('#timer').hide();
            audioDone();
            // console.log('Failed validations:', data);
            // document.getElementById('failuresContainer').classList.remove('d-none');

            // const tbody = document.querySelector('#failuresTable tbody');
            // tbody.innerHTML = ''; // clear previous rows if any

            // data.forEach((item, index) => {
            //     const row = document.createElement('tr');
            //     row.innerHTML = `
            //         <td>${index + 1}</td>
            //         <td>${item.name || ''}</td>
            //         <td>${item.speakerid || ''}</td>
            //         <td>${item.speakerId_sequence || ''}</td>
            //         <td>${item.text || ''}</td>
            //         <td>${item.speed || ''}</td>
            //     `;
            //     tbody.appendChild(row);

            // });
            // $('#doneMove').show()
            
        }
    } catch (error) {
        console.error('Error fetching failed validations:', error);
    }
}
function audioDone() {
    $('#record').hide();
    $('#save').hide();
    $('#analyser').hide();
    $('#wavedisplay').hide();
    $('.audio').remove();
    $('#title').hide();
    $('#alert').hide();
    $('#texttorec').hide();
    $('#done').show();
    $('#timer').hide();
    $('#done').text("Thanking You");
    clearAllSavedState();
}
function toggleRecording(e) {
    if (!window.audioInit) {
        initAudio();
    }

    console.log('audioRecorder before check:', audioRecorder); // Log before check

    if (!window.audioRecorder || typeof window.audioRecorder.record !== 'function') { // Robust check for GLOBAL audioRecorder
        console.warn("window.audioRecorder is invalid or not ready, waiting...", window.audioRecorder); // Detailed warning
        return setTimeout(function() { toggleRecording(e) }, 100);
    }

    console.log('audioRecorder after check:', window.audioRecorder); // Log after check
    console.log('tEXT', $('#record').text());

    if ($('#record').text().match(/Stop/)) {
        // stop recording
        console.log('stop');
        window.audioRecorder.stop(); // Use window.audioRecorder consistently
        $('#record').removeClass("btn-danger");
        $('#record').text('Record Again');
        $('#save').show();
        $('#analyser').hide();
        $('#wavedisplay').show();

        stopTimer();
        hideTimer();
        window.audioRecorder.getBuffers(gotBuffers); // Use window.audioRecorder consistently
    } else {
        // start recording
        if (!window.audioRecorder) // Redundant check, but keep for clarity
            return;
        console.log('record');
        $('#save').hide();
        $('#analyser').show();
        $('#wavedisplay').hide();
        $('.audio').remove();
        $('#record').addClass("btn-danger");
        $('#alert').hide();
        $('#record').text('Stop Recording');
        window.audioRecorder.clear(); // Use window.audioRecorder consistently
        window.audioRecorder.record(); // Use window.audioRecorder consistently
        showAudioControls();
        startTimer();
    }
}

// Add this new function to hide the timer
function hideTimer() {
    document.getElementById('timer').classList.add('hidden');
}

function convertToMono( input ) {
    var splitter = audioContext.createChannelSplitter(2);
    var merger = audioContext.createChannelMerger(2);

    input.connect( splitter );
    splitter.connect( merger, 0, 0 );
    splitter.connect( merger, 0, 1 );
    return merger;
}

function cancelAnalyserUpdates() {
    window.cancelAnimationFrame( rafID );
    rafID = null;
}

function updateAnalysers(time) {
    if (!analyserContext) {
        var canvas = document.getElementById("analyser");
        canvasWidth = canvas.width;
        canvasHeight = canvas.height;
        analyserContext = canvas.getContext('2d');
    }

    // analyzer draw code here
    {
        var SPACING = 3;
        var BAR_WIDTH = 1;
        var numBars = Math.round(canvasWidth / SPACING);
        var freqByteData = new Uint8Array(analyserNode.frequencyBinCount);

        analyserNode.getByteFrequencyData(freqByteData);

        analyserContext.clearRect(0, 0, canvasWidth, canvasHeight);
        analyserContext.fillStyle = '#F6D565';
        analyserContext.lineCap = 'round';
        var multiplier = analyserNode.frequencyBinCount / numBars;

        // Draw rectangle for each frequency bin.
        for (var i = 0; i < numBars; ++i) {
            var magnitude = 0;
            var offset = Math.floor( i * multiplier );
            // gotta sum/average the block, or we miss narrow-bandwidth spikes
            for (var j = 0; j< multiplier; j++)
                magnitude += freqByteData[offset + j];
            magnitude = magnitude / multiplier;
            var magnitude2 = freqByteData[i * multiplier];
            analyserContext.fillStyle = "hsl( " + Math.round((i*360)/numBars) + ", 100%, 50%)";
            analyserContext.fillRect(i * SPACING, canvasHeight, BAR_WIDTH, -magnitude);
        }
    }

    rafID = window.requestAnimationFrame( updateAnalysers );
}

function toggleMono() {
    if (audioInput != realAudioInput) {
        audioInput.disconnect();
        realAudioInput.disconnect();
        audioInput = realAudioInput;
    } else {
        realAudioInput.disconnect();
        audioInput = convertToMono( realAudioInput );
    }

    audioInput.connect(inputPoint);
}

function gotStream(stream) {
    inputPoint = audioContext.createGain();

    // Create an AudioNode from the stream.
    realAudioInput = audioContext.createMediaStreamSource(stream);
    audioInput = realAudioInput;
    audioInput.connect(inputPoint);

    //    audioInput = convertToMono( input );

    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    inputPoint.connect( analyserNode );

    audioRecorder = new Recorder( inputPoint );

    zeroGain = audioContext.createGain();
    zeroGain.gain.value = 0.0;
    inputPoint.connect( zeroGain );
    zeroGain.connect( audioContext.destination );
    console.log("initAudio() completed");
    updateAnalysers();
    return true;
}

function initAudio() {
    window.audioContext = new AudioContext();
    window.audioInput = null;
    window.realAudioInput = null;
    window.inputPoint = null;
    window.audioRecorder = null;
    window.rafID = null;
    window.analyserContext = null;
    window.canvasWidth;
    window.canvasHeight;
    window.recIndex = 0;
    window.audioInit = true;

    if (!navigator.getUserMedia)
        navigator.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
    if (!navigator.cancelAnimationFrame)
        navigator.cancelAnimationFrame = navigator.webkitCancelAnimationFrame || navigator.mozCancelAnimationFrame;
    if (!navigator.requestAnimationFrame)
        navigator.requestAnimationFrame = navigator.webkitRequestAnimationFrame || navigator.mozRequestAnimationFrame;

    navigator.getUserMedia(
        {
            "audio": {
                "mandatory": {
                    "googEchoCancellation": "false",
                    "googAutoGainControl": "false",
                    "googNoiseSuppression": "false",
                    "googHighpassFilter": "false"
                },
                "optional": []
            },
        }, gotStream, function(e) {
            alert('Error getting audio');
            console.log(e);
        });
}
