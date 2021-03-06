const regression = require('regression');

const express = require('express');
const app = express();
const LastN = 20;
const THRESHOLD = 20;

var  DippingTime =   5 * 60 * 1000; 

var sips = [];
var temps = [];
var lastNtemps=[];

var dipping = false;
var autodip = false;
var autodipEnd = -1000;
var forceDipping = false;

Array.prototype.simpleSMA = function(N) {
  return this.map(function(x, i, v) {
    if (i < N - 1) return NaN;
    return v.filter(function(x2, i2) {
      return i2 <= i && i2 > i - N;
    }).reduce(function(a, b) {
      return a + b;
    }) / N;
  });
};

function lastSpikeRegression(data){
  //console.log(data)
  var i = data.length-1;
  var last = data[i][1];
  while(i >= LastN && (last - data[i-LastN][1]) < THRESHOLD){
    i--;
    last = data[i][1];
  }
  if(i > LastN*2){
    var sliced = data.slice(i)
    sliced = sliced.slice(sliced.length - Math.min(sliced.length, 100));
    console.log(sliced);
    var firstD = sliced[0][0];
    sliced.forEach((v,j)=>{
      sliced[j][0] -= firstD;
      sliced[j][0]/=1000;
      
    })
    //console.log(sliced)
    var desiredTemp = 50;
    var res = regression.exponential(sliced,{precision:10});
  
    return {
      coeffs: res.equation,
      r2: res.r2
    }
    //console.log(coeffs)
    //console.log();
  } else {
    //console.log("No Spike")
    return null;
  }
  
}

function movingAverage(data,N){
  var dates = [];
  var temps = [];
  data.forEach(obj=>{
    dates.push(obj[0]);
    temps.push(obj[1]);
    
  })
  var res = [];
  
  tempsAvg = temps.simpleSMA(N);

  tempsAvg.forEach((val, i)=>{
    if(isNaN(val)){
      return;
      res.push([dates[i],temps[i]])
    } else {
      res.push([dates[i],val])
    }
  });

  return res
  
}

// Parse POSTed data as json
app.use(express.json());

// Allow access to website
app.use(express.static('../client'))


app.post('/cup/temp', function(req, res) {
  temps.push([Date.now(), req.body.temp]);
  res.end('ok');
  updateDipping();
});

function updateDipping() {
  if (temps.length >= 2) {
    var pastTemp = temps[Math.max(0, temps.length - 10)][1];
    var tempNow = temps[temps.length - 1][1];
    if (tempNow > 40 && tempNow - pastTemp > 20) {
      autodipEnd = Date.now() + DippingTime;
    }
  }
  dipping = forceDipping || (autodip && Date.now() < autodipEnd);
}

app.get('/cup/temp/history', function(req, res) {
  // Return data from last 10 minutes
  var now = Date.now();
  var duration = 10 * 60 * 1000;

  var data = temps.filter(time => time[0] > now - duration);
  //data = data.map(el=>return [el[0]])
  
  var data_to_send = {
    data: movingAverage(data,LastN),
    reg: null,
    autodip: autodip
  } 
  
  if(data.length > LastN){
    data_to_send.reg = lastSpikeRegression(JSON.parse(JSON.stringify(data)));
  }
  res.json(data_to_send);
});


app.get('/cup/sips/history', function(req, res) {
  // Return data from last 10 minutes
  var now = Date.now();
  var duration = 10 * 60 * 1000;
  res.json({
    sips: sips.filter(time => time > now - duration)
  });
});


app.post('/cup/sip', function(req, res) {
  sips.push(Date.now());
  res.end('ok');
});

app.get('/cup/commands', function(req, res) {
  updateDipping();
  res.json({dipping: dipping});
});

app.post('/cup/commands', function(req, res){
  if(typeof req.body.autodip != "undefined") {
    if(req.body.autodip)
      autodip = true;
    else
      autodip = false;
    }
  if(typeof req.body.dip != "undefined") {
    if(req.body.dip){
      forceDipping = true;
    } else {
      forceDipping = false;
    }
  }
  
  
  res.end('ok');
  console.log(autodip, forceDipping);
});

app.listen(3000, function() {
  console.log('Supercup server listening on port 3000');
});
