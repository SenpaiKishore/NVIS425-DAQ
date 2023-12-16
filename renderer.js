const { ipcRenderer } = require('electron');
const { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Legend, Title, Tooltip } = require('chart.js');
const fs = require('fs');
const path = require('path');

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Legend, Title, Tooltip);

let dataToSend = [0, 0, 0, 0, 0, 0]; 
const characters = ['A', 'B', 'C', 'D', 'E', 'F'];
let character;
const charts = [];
let csvData = {
    chart1: [],
    chart2: [],
    chart3: [],
    chart4: [],
    chart5: []
};
function updateButtonColor(btIndex) {
    const button = document.getElementById(`button${btIndex}`);
    if(btIndex == 0){
        state = dataToSend[0];
    } else {
        state = dataToSend[btIndex];
    }
    if (state === 1) {
        button.classList.remove('button-off');
        button.classList.add('button-on');
    } else {
        button.classList.remove('button-on');
        button.classList.add('button-off');
    }
}

function getCharacterToSend(btIndex) {
    // This function determines which character to send based on button states
    let characterToSend = '';
    state = dataToSend[btIndex]
    if (state === 1) {
        characterToSend = characters[btIndex]; // Uppercase if the button is on
    } else if (state === 0) {
        characterToSend = characters[btIndex].toLowerCase(); // Lowercase if the button is off
    }
    character = characterToSend;
    return characterToSend;
}

function continuouslySendData() {
    // This function sends data continuously every 100ms
    if (dataToSend[0]) {
        ipcRenderer.send('send-to-arduino', 'A');
        console.log("Sent: ", 'A');
    } 
}

function sendData() {
    // This function sends data continuously every 100ms
    const characterToSend = character;
    if (characterToSend &&  (characterToSend == 'A' || characterToSend == 'a')) {
        ipcRenderer.send('send-to-arduino', characterToSend);
        console.log("Sent: ", characterToSend);
    } 
}
function downloadAllGraphsCSV() {
    // Assuming all charts have the same number of data points and labels
    if (charts.length === 0 || charts[0].data.labels.length === 0) {
        console.error('No data to download');
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    let maxLength = Math.max(...Object.values(csvData).map(arr => arr.length));
    
    // Add header row - Time, Graph 1, Graph 2, ...
    let headerRow = "Time,";
    headerRow += charts.map((_, index) => `Graph ${index + 1}`).join(',');
    csvContent += headerRow + "\n";

    // Add data rows
    for (let i = 0; i < maxLength; i++) {
        let row = `${i},`; // Replace with actual timestamp or index if available
        Object.keys(csvData).forEach((key, index, array) => {
            row += csvData[key][i] !== undefined ? csvData[key][i] : "";
            if (index < array.length - 1) {
                row += ",";
            }
        });
        csvContent += row + "\n";
    }

    // Encode and create a link to download
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "all_graphs_data.csv");
    document.body.appendChild(link);

    // Trigger download and remove link
    link.click();
    document.body.removeChild(link);
}

function updateChartScales(chart, data) {
    let minValue = Math.min(...data);
    let maxValue = Math.max(...data);
    chart.options.scales.y.min = minValue - (0.1 * Math.abs(minValue));
    chart.options.scales.y.max = maxValue + (0.1 * Math.abs(maxValue));
}

document.addEventListener('DOMContentLoaded', () => {
    ipcRenderer.on('list-ports', (event, ports) => {
        const comPortsSelect = document.getElementById('comPorts');
        comPortsSelect.innerHTML = ''; // Clear existing options
    
        ports.forEach(port => {
            const option = document.createElement('option');
            option.value = port.path;
            option.textContent = port.path;
            comPortsSelect.appendChild(option);
        });
    });

    for (let i = 1; i <= 5; i++) {
        const ctx = document.getElementById(`chart${i}`).getContext('2d');
        let tlabel;
        if(i==1){
            tlabel = 'State of Charge (SOC)'
        }else if(i==2){
            tlabel = 'Depth of Discharge (DOD)'
        }else if(i==3){
            tlabel = 'Battery Voltage (V)'
        } else if(i==4){
            tlabel = 'Battery Current (A)'
        } else if(i==5){
            tlabel = 'Battery Power (Watt)'
        }
        charts.push(new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: tlabel,
                    data: [],
                    borderColor: '#007bff',
                    borderWidth: 2
                    
                }]
            },
            options: {
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: tlabel,
                        color: 'black',
                    }
                },
                scales: {
                    x: {
                        type: 'category',
                    },
                    y: {
                        type: 'linear',
                        beginAtZero: true,
                        ticks: {
                            color: "#000"
                        }
                    }
                },
                maintainAspectRatio: false,
                elements: {
                    point:{
                        radius: 0
                    },
                    line: {
                        tension: 0.5
                    }
                }
            }
        }));
    }
    
    ipcRenderer.on('serial-data', (event, data) => {
        const values = data.split(',').map(Number);
        values.forEach((value, index) => {
            if (charts[index]) {
                const chart = charts[index];

                if (chart.data.datasets[0].data.length >= 100) {
                    chart.data.labels.shift();
                    chart.data.datasets[0].data.shift();
                }
                chart.data.labels.push('');
                chart.data.datasets[0].data.push(value);
                updateChartScales(chart, chart.data.datasets[0].data);
                chart.update();

                const currentValueElement = document.getElementById(`current-value${index + 1}`);
                if (currentValueElement) {
                    currentValueElement.textContent = value;
                    if(index == 0){
                        document.getElementById('progressBar').style.width = `${value}%`;
                    }
                }

                csvData[`chart${index + 1}`].push(value);
            }
        });
    });
    
    document.getElementById(`button0`).addEventListener('click', () => {
        const selectedPort = document.getElementById('comPorts').value;
        ipcRenderer.send('start-daq', selectedPort);
        dataToSend[0] = dataToSend[0] === 0 ? 1 : 0;
        updateButtonColor(0);
        if (document.getElementById(`button0`).textContent == 'Start DAQ'){
            document.getElementById(`button0`).textContent = 'Stop DAQ'
        } else {
            document.getElementById(`button0`).textContent = 'Start DAQ'
        }
    });
    setInterval(continuouslySendData, 500);
    document.getElementById('downloadButton').addEventListener('click', downloadAllGraphsCSV);
});
