const { ipcRenderer } = require('electron');
const { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Legend, Title, Tooltip } = require('chart.js');

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Legend, Title, Tooltip);

let dataToSend = [0, 0, 0, 0, 0, 0]; 
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
        button.classList.add('button-on');
    } else {
        button.classList.remove('button-on');
    }
}

function continuouslySendData() {
    if (dataToSend[0]) {
        ipcRenderer.send('send-to-arduino', 'A');
        console.log("Sent: ", 'A');
    } 
}

function downloadAllGraphsCSV() {
    if (charts.length === 0 || charts[0].data.labels.length === 0) {
        console.error('No data to download');
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    let maxLength = Math.max(...Object.values(csvData).map(arr => arr.length));

    let headerRow = "Time,";
    let headerRows = ['State of Charge(SOC)', 'Depth of Discharge(DOD)', 'Voltage(V)', 'Current(Amp)', 'Power(Watt)']
    headerRow += charts.map((_, index) => `${headerRows[index]}`).join(',');
    csvContent += headerRow + "\n";

    for (let i = 0; i < maxLength; i++) {
        let row = `${i},`;
        Object.keys(csvData).forEach((key, index, array) => {
            row += csvData[key][i] !== undefined ? csvData[key][i] : "";
            if (index < array.length - 1) {
                row += ",";
            }
        });
        csvContent += row + "\n";
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "all_graphs_data.csv");
    document.body.appendChild(link);

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
    ipcRenderer.send('refresh-ports');
    ipcRenderer.on('list-ports', (event, ports) => {
        const comPortsSelect = document.getElementById('comPorts');
        comPortsSelect.innerHTML = '';
    
        ports.forEach(port => {
            const option = document.createElement('option');
            option.value = port.path;
            option.textContent = port.path;
            comPortsSelect.appendChild(option);
        });
    });
    let chartColors = ['rgba(153, 102, 255, 1)', 'rgba(0, 123, 255, 1)', 'rgba(255, 99, 132, 1)', 'rgba(75, 192, 192, 1)', 'rgba(255, 153, 0, 1)']
    let tlabel = ['State of Charge (SOC)', 'Depth of Discharge (DOD)', 'Battery Voltage (V)', 'Battery Current (A)', 'Battery Power (Watt)'];
    for (let i = 1; i <= 5; i++) {
        const ctx = document.getElementById(`chart${i}`).getContext('2d');
        charts.push(new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: tlabel[i - 1],
                    data: [],
                    borderColor: chartColors[i - 1],
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
                        text: tlabel[i - 1],
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
        if(selectedPort == ''){
            alert("Please select a valid port")
        } else {
            ipcRenderer.send('start-daq', selectedPort);
            dataToSend[0] = dataToSend[0] === 0 ? 1 : 0;
            updateButtonColor(0);
            if (document.getElementById(`button0`).textContent == 'Start DAQ'){
                document.getElementById(`button0`).textContent = 'Stop DAQ'
            } else {
                alert("Data acquisition has stopped.")
                document.getElementById(`button0`).textContent = 'Start DAQ'
            }
        }
    });
    setInterval(continuouslySendData, 500);
    document.getElementById('downloadButton').addEventListener('click', downloadAllGraphsCSV);
});
