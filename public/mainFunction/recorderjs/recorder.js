
(function(window){

  var WORKER_PATH = 'mainFunction/recorderjs/recorderWorker.js';
  var WORKER_PATH2 = './mainFunction/recorderjs/recorderWorker.js';
  
  // Function to get the correct worker path
  function getWorkerPath() {
    var basePath = window.location.pathname.includes('/') ? 
      window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1) : '/';
    
    if (basePath === '/') {
      return WORKER_PATH;
    } else {
      return basePath + WORKER_PATH;
    }
  }

  var Recorder = function(source, cfg){
    var config = cfg || {};
    var bufferLen = config.bufferLen || 4096;
    this.context = source.context;
    if(!this.context.createScriptProcessor){
       this.node = this.context.createJavaScriptNode(bufferLen, 2, 2);
    } else {
       this.node = this.context.createScriptProcessor(bufferLen, 2, 2);
    }

    var workerPath = config.workerPath || getWorkerPath();
    console.log('Attempting to load worker from:', workerPath);
    
    var worker;
    try {
      worker = new Worker(workerPath);
    } catch (e) {
      console.error('Failed to load worker from:', workerPath, 'Error:', e);
      // Fallback to alternative path
      try {
        worker = new Worker(WORKER_PATH2);
        console.log('Fallback worker loaded from:', WORKER_PATH2);
      } catch (e2) {
        console.error('Fallback worker also failed:', e2);
        throw new Error('Unable to load audio worker');
      }
    }
    worker.postMessage({
      command: 'init',
      config: {
        sampleRate: this.context.sampleRate
      }
    });
    var recording = false,
      currCallback;

    this.node.onaudioprocess = function(e){
      if (!recording) return;
      worker.postMessage({
        command: 'record',
        buffer: [
          e.inputBuffer.getChannelData(0),
          e.inputBuffer.getChannelData(1)
        ]
      });
    }

    this.configure = function(cfg){
      for (var prop in cfg){
        if (cfg.hasOwnProperty(prop)){
          config[prop] = cfg[prop];
        }
      }
    }

    this.record = function(){
      recording = true;
    }

    this.stop = function(){
      recording = false;
    }

    this.clear = function(){
      worker.postMessage({ command: 'clear' });
    }

    this.getBuffers = function(cb) {
      currCallback = cb || config.callback;
      worker.postMessage({ command: 'getBuffers' })
    }

    this.exportWAV = function(cb, type){
      currCallback = cb || config.callback;
      type = type || config.type || 'audio/wav';
      if (!currCallback) throw new Error('Callback not set');
      worker.postMessage({
        command: 'exportWAV',
        type: type
      });
    }

    this.exportMonoWAV = function(cb, type){
      currCallback = cb || config.callback;
      type = type || config.type || 'audio/wav';
      if (!currCallback) throw new Error('Callback not set');
      worker.postMessage({
        command: 'exportMonoWAV',
        type: type
      });
    }

    worker.onmessage = function(e){
      var blob = e.data;
      currCallback(blob);
    }

    source.connect(this.node);
    this.node.connect(this.context.destination);   // if the script node is not connected to an output the "onaudioprocess" event is not triggered in chrome.
  };

  Recorder.setupDownload = function(blob, filename, callback){
    var url = (window.URL || window.webkitURL).createObjectURL(blob);
    // var link = document.getElementById("save");
    // link.href = url;
    console.log( 'URL', url, filename, blob )
    window.audioBlob = blob;
    window.audioURL = url;
    // link.download = filename || 'output.wav';
    var reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = function() {
        var base64data = reader.result;
        callback(base64data);
    }
  }

  window.Recorder = Recorder;

})(window);
