// Dito gagawin yung frontend interaction at animation ng simulator,
// tulad ng pag-update ng CPU, Ready Queue, Event Log, at Gantt Chart.

const jobIdInput = document.getElementById("job-id");
const jobNameInput = document.getElementById("job-name");
const arrivalInput = document.getElementById("arrival-time");
const durationInput = document.getElementById("duration");

const jobTableBody = document.getElementById("job-table-body");
const resultsTableBody = document.getElementById("results-table-body");

const addJobBtn = document.getElementById("add-job-btn");
const loadCsvBtn = document.getElementById("load-csv-btn");
const csvFileInput = document.getElementById("csv-file-input");
const clearJobsBtn = document.getElementById("clear-jobs-btn");

const startBtn = document.getElementById("start-btn");
const pauseBtn = document.getElementById("pause-btn");
const resetBtn = document.getElementById("reset-btn");

const speedSelect = document.getElementById("speed-select");
const jobMessage = document.getElementById("job-message");

const cpuBox = document.getElementById("cpu-box");
const cpuJob = document.getElementById("cpu-job");
const cpuRemaining = document.getElementById("cpu-remaining");

const readyQueue = document.getElementById("ready-queue");
const eventLog = document.getElementById("event-log");

const ganttChart = document.getElementById("gantt-chart");
const ganttTimeline = document.getElementById("gantt-timeline");
const clockValue = document.getElementById("clock-value");

let simulationData = null;
let currentTime = 0;
let animationTimer = null;

let isRunning = false;
let isPaused = false;

const UNIT_WIDTH = 44;

let jobColorMap = {};

function showMessage(message, type = "") {
    jobMessage.textContent = message;
    jobMessage.className = type;
}

function addJob() {
    if (isRunning) return;

    const jobId = jobIdInput.value.trim();
    const jobName = jobNameInput.value.trim();
    const arrival = arrivalInput.value.trim();
    const duration = durationInput.value.trim();

    if (!jobId || !jobName || arrival === "" || duration === "") {
        showMessage("Please complete all job fields.", "error");
        return;
    }

    const arrivalTime = Number(arrival);
    const estimatedDuration = Number(duration);

    if (
        !Number.isInteger(arrivalTime) ||
        !Number.isInteger(estimatedDuration) ||
        arrivalTime < 0 ||
        estimatedDuration <= 0
    ) {
        showMessage(
            "Arrival must be a non-negative whole number, and duration must be a positive whole number.",
            "error"
        );
        return;
    }

    const existingIds = getJobs().map(job => job.job_id);

    if (existingIds.includes(jobId)) {
        showMessage("Job ID already exists.", "error");
        return;
    }

    const job = {
        job_id: jobId,
        job_name: jobName,
        arrival_time: arrivalTime,
        duration: estimatedDuration
    };

    addJobToTable(job);

    jobIdInput.value = "";
    jobNameInput.value = "";
    arrivalInput.value = "";
    durationInput.value = "";

    resetDisplay();
    showMessage(`${jobId} added successfully.`, "success");
}

function addJobToTable(job) {
    const row = document.createElement("tr");

    const values = [
        job.job_id,
        job.job_name,
        job.arrival_time,
        job.duration
    ];

    values.forEach(value => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
    });

    jobTableBody.appendChild(row);
}
function getJobs() {
    return [...jobTableBody.querySelectorAll("tr")].map(row => {
        const cells = row.querySelectorAll("td");

        return {
            job_id: cells[0].textContent.trim(),
            job_name: cells[1].textContent.trim(),
            arrival_time: Number(cells[2].textContent),
            duration: Number(cells[3].textContent)
        };
    });
}

// Open the computer's file picker.
loadCsvBtn.addEventListener("click", function () {
    if (!isRunning) {
        csvFileInput.click();
    }
});


// Read and load the selected CSV file.
csvFileInput.addEventListener("change", async function () {
    const file = csvFileInput.files[0];

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
        showMessage("Please select a CSV file.", "error");
        csvFileInput.value = "";
        return;
    }

    try {
        showMessage(`Reading ${file.name}...`);

        const csvText = await file.text();

        // Validate and parse the file before changing the table.
        const jobs = parseCSV(csvText);

        if (jobs.length === 0) {
            throw new Error("The CSV file contains no jobs.");
        }

        // Stop any previous animation.
        stopAnimation();

        // Replace the old jobs with the uploaded jobs.
        jobTableBody.replaceChildren();

        jobs.forEach(job => {
            addJobToTable(job);
        });

        // Clear the previous simulation output.
        resetDisplay();

        showMessage(
            `${jobs.length} job(s) loaded from ${file.name}.`,
            "success"
        );

    } catch (error) {
        console.error("CSV upload error:", error);

        showMessage(error.message, "error");
    }

    // Allows the same file to be selected again.
    csvFileInput.value = "";
});

function parseCSV(text) {
    const rows = [];

    let row = [];
    let field = "";
    let insideQuotes = false;

    // Remove the optional UTF-8 byte-order mark.
    text = text.replace(/^\uFEFF/, "");

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === '"') {
            // Two quotes inside a quoted field represent one quote.
            if (insideQuotes && text[i + 1] === '"') {
                field += '"';
                i++;
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (char === "," && !insideQuotes) {
            row.push(field.trim());
            field = "";
        } else if (
            (char === "\n" || char === "\r") &&
            !insideQuotes
        ) {
            // Support both Windows and Unix line endings.
            if (char === "\r" && text[i + 1] === "\n") {
                i++;
            }

            row.push(field.trim());

            if (row.some(value => value !== "")) {
                rows.push(row);
            }

            row = [];
            field = "";
        } else {
            field += char;
        }
    }

    if (insideQuotes) {
        throw new Error("A quoted field was not closed.");
    }

    // Add the final row if the file does not end with a newline.
    if (field !== "" || row.length > 0) {
        row.push(field.trim());

        if (row.some(value => value !== "")) {
            rows.push(row);
        }
    }

    if (rows.length < 2) {
        throw new Error(
            "The CSV must contain column headers and at least one job."
        );
    }

    // Required column names.
    const headers = rows[0].map(header =>
        header.trim().toLowerCase()
    );
    const requiredHeaders = [
        "job id",
        "job name",
        "arrival time",
        "estimated duration"
    ];

const indexes = requiredHeaders.map(header =>
    headers.indexOf(header)
);

    if (indexes.some(index => index === -1)) {
        throw new Error(
            "Missing required columns: Job ID, Job Name, Arrival Time, Estimated Duration."
        );
    }

    const jobs = rows.slice(1).map((values, index) => {
        const csvRowNumber = index + 2;

        // Make sure each row contains all required columns.
        if (indexes.some(columnIndex => columnIndex >= values.length)) {
            throw new Error(
                `CSV row ${csvRowNumber} has missing values.`
            );
        }

        const arrivalValue = values[indexes[2]];
        const durationValue = values[indexes[3]];

        const job = {
            job_id: values[indexes[0]],
            job_name: values[indexes[1]],
            arrival_time: Number(arrivalValue),
            duration: Number(durationValue)
        };

        if (
            !job.job_id ||
            !job.job_name ||
            arrivalValue === "" ||
            durationValue === "" ||
            !Number.isInteger(job.arrival_time) ||
            !Number.isInteger(job.duration) ||
            job.arrival_time < 0 ||
            job.duration <= 0
        ) {
            throw new Error(
                `Invalid data on CSV row ${csvRowNumber}. Check the job ID, name, arrival time, and duration.`
            );
        }

        return job;
    });

    // Check for duplicate IDs within the uploaded file.
    const ids = jobs.map(job => job.job_id);

    if (new Set(ids).size !== ids.length) {
        throw new Error("The CSV contains duplicate Job IDs.");
    }

    return jobs;
}

function clearJobs() {
    if (isRunning) return;

    stopAnimation();

    jobTableBody.replaceChildren();

    resetDisplay();

    showMessage("All jobs have been cleared.", "success");
}

async function startSimulation() {
    if (isRunning) return;

    stopAnimation();
    resetDisplay();

    const jobs = getJobs();

    if (jobs.length === 0) {
        showMessage(
            "Add jobs or upload a CSV file first.",
            "error"
        );
        return;
    }

    try {
        showMessage("Calculating SRTF schedule...");

        startBtn.disabled = true;
        loadCsvBtn.disabled = true;
        csvFileInput.disabled = true;
        addJobBtn.disabled = true;
        clearJobsBtn.disabled = true;

        const response = await fetch("/api/simulate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                jobs: jobs
            })
        });

        const responseText = await response.text();

        let data;

        try {
            data = JSON.parse(responseText);
        } catch {
            throw new Error(
                "Flask returned HTML instead of JSON. Check the /api/simulate route."
            );
        }

        if (!response.ok) {
            throw new Error(data.error || "Simulation failed.");
        }

        simulationData = data;
        currentTime = 0;

        // Assign a color to each job.
        jobColorMap = {};

        simulationData.jobs.forEach((job, index) => {
            jobColorMap[job.job_id] = index % 10;
        });

        isRunning = true;
        isPaused = false;

        startBtn.disabled = true;
        pauseBtn.disabled = false;
        pauseBtn.textContent = "Pause";

        prepareTimeline();
        displayResults();

        showMessage("Simulation is running.", "success");

        animateStep();

    } catch (error) {
        console.error("Simulation error:", error);

        showMessage(error.message, "error");

        enableInputControls();
    }
}

function togglePause() {
    if (!isRunning) return;

    isPaused = !isPaused;

    if (isPaused) {
        clearTimeout(animationTimer);

        pauseBtn.textContent = "Resume";
        showMessage("Simulation paused.");

    } else {
        pauseBtn.textContent = "Pause";
        showMessage("Simulation resumed.", "success");

        animateStep();
    }
}

function stopAnimation() {
    clearTimeout(animationTimer);

    animationTimer = null;
    isRunning = false;
    isPaused = false;
}


function resetSimulation() {
    stopAnimation();
    resetDisplay();

    showMessage("Simulation has been reset.");
}


function resetDisplay() {
    currentTime = 0;
    simulationData = null;
    jobColorMap = {};

    clockValue.textContent = "0";

    cpuJob.textContent = "Idle";
    cpuRemaining.textContent = "";

    cpuBox.classList.remove("running", "is-running");

    readyQueue.replaceChildren();
    eventLog.replaceChildren();

    ganttChart.replaceChildren();
    ganttTimeline.replaceChildren();

    resultsTableBody.replaceChildren();

    document.getElementById("avg-waiting").textContent = "-";
    document.getElementById("avg-turnaround").textContent = "-";
    document.getElementById("total-burst").textContent = "-";
    document.getElementById("total-finish").textContent = "-";
    document.getElementById("cpu-utilization").textContent = "-";
    document.getElementById("throughput").textContent = "-";
    document.getElementById("preemptions").textContent = "-";

    startBtn.disabled = false;
    pauseBtn.disabled = true;
    pauseBtn.textContent = "Pause";

    enableInputControls();
}


function enableInputControls() {
    startBtn.disabled = false;
    loadCsvBtn.disabled = false;
    csvFileInput.disabled = false;
    addJobBtn.disabled = false;
    clearJobsBtn.disabled = false;
}


function prepareTimeline() {
    ganttTimeline.replaceChildren();

    addTimelineMarker(0);
}


function addTimelineMarker(time) {
    const marker = document.createElement("span");

    marker.textContent = time;
    marker.style.width = `${UNIT_WIDTH}px`;

    ganttTimeline.appendChild(marker);
}


function addGanttUnit(jobId, time) {
    const children = [...ganttChart.children];
    const lastBlock = children[children.length - 1];

    const displayedJobId = jobId ?? "IDLE";

    const className = jobId === null
        ? "idle"
        : `job-${jobColorMap[jobId] ?? 0}`;

    // Merge consecutive units of the same job.
    if (
        lastBlock &&
        lastBlock.dataset.jobId === displayedJobId &&
        Number(lastBlock.dataset.end) === time
    ) {
        lastBlock.dataset.end = time + 1;

        lastBlock.style.width =
            `${(time + 1 - Number(lastBlock.dataset.start)) * UNIT_WIDTH}px`;

        lastBlock.title =
            `${jobId ?? "CPU Idle"}: ${lastBlock.dataset.start} - ${time + 1}`;

    } else {
        const block = document.createElement("div");

        block.className = className;
        block.dataset.jobId = displayedJobId;
        block.dataset.start = time;
        block.dataset.end = time + 1;

        block.style.width = `${UNIT_WIDTH}px`;
        block.textContent = jobId ?? "Idle";

        block.title =
            `${jobId ?? "CPU Idle"}: ${time} - ${time + 1}`;

        ganttChart.appendChild(block);
    }

    addTimelineMarker(time + 1);
}


function getRunningSegment(time) {
    return simulationData.gantt_chart.find(segment =>
        segment.start <= time && time < segment.end
    ) || null;
}


function getRemainingTime(jobId, time) {
    const job = simulationData.jobs.find(
        item => item.job_id === jobId
    );

    if (!job) return 0;

    let executedTime = 0;

    simulationData.gantt_chart.forEach(segment => {
        if (segment.job_id !== jobId) return;

        const executedUntil = Math.min(time, segment.end);

        if (executedUntil > segment.start) {
            executedTime += executedUntil - segment.start;
        }
    });

    return job.duration - executedTime;
}


function updateCPU(time) {
    const segment = getRunningSegment(time);

    if (!segment) {
        cpuJob.textContent = "Idle";
        cpuRemaining.textContent = "No job is executing.";

        cpuBox.classList.remove("running", "is-running");

        return null;
    }

    const jobId = segment.job_id;
    const remaining = getRemainingTime(jobId, time);

    cpuJob.textContent = jobId;
    cpuRemaining.textContent = `Remaining Time: ${remaining}`;

    cpuBox.classList.add("running");

    return jobId;
}


function updateReadyQueue(time) {
    const queueEvents = simulationData.events.filter(event =>
        event.time <= time &&
        (event.type === "QUEUE_PUSH" || event.type === "QUEUE_POP")
    );

    const queueEvent = queueEvents[queueEvents.length - 1];

    readyQueue.replaceChildren();

    const queue = queueEvent ? queueEvent.queue : [];

    queue.forEach(jobId => {
        const item = document.createElement("div");

        item.textContent = jobId;

        const colorIndex = jobColorMap[jobId] ?? 0;
        item.classList.add(`job-${colorIndex}`);

        readyQueue.appendChild(item);
    });
}


function formatEvent(event) {
    const jobId = event.job_id ? ` ${event.job_id}` : "";

    switch (event.type) {
        case "ARRIVAL":
            return `${jobId} arrived in the system.`;

        case "QUEUE_PUSH":
            return `${jobId} added to the ready queue.`;

        case "QUEUE_POP":
            return `${jobId} selected from the ready queue.`;

        case "DISPATCH":
            return `${jobId} dispatched to the CPU.`;

        case "RESUME":
            return `${jobId} resumed execution.`;

        case "PREEMPTION":
            return `${jobId} preempted by ${event.replaced_by}.`;

        case "EXECUTION":
            return `${jobId} executed. Remaining time: ${event.remaining_time}.`;

        case "COMPLETION":
            return `${jobId} completed execution.`;

        case "CPU_IDLE":
            return `CPU is idle until time ${event.end_time}.`;

        default:
            return `${event.type}${jobId}`;
    }
}


function displayEventsAt(time) {
    simulationData.events
        .filter(event => event.time === time)
        .forEach(event => {
            const entry = document.createElement("div");

            entry.textContent =
                `[T=${event.time}] ${formatEvent(event)}`;

            eventLog.appendChild(entry);
        });

    eventLog.scrollTop = eventLog.scrollHeight;
}



function animateStep() {
    if (!isRunning || isPaused || !simulationData) return;

    const finishTime = simulationData.statistics.total_finish_time;

    // Display final events after the last execution unit.
    if (currentTime >= finishTime) {
        displayEventsAt(currentTime);

        clockValue.textContent = currentTime;

        cpuJob.textContent = "Completed";
        cpuRemaining.textContent = "All jobs have finished.";

        cpuBox.classList.remove("running", "is-running");

        readyQueue.replaceChildren();

        finishSimulation();
        return;
    }

    displayEventsAt(currentTime);

    const runningJob = updateCPU(currentTime);

    updateReadyQueue(currentTime);

    addGanttUnit(runningJob, currentTime);

    currentTime++;

    clockValue.textContent = currentTime;

    animationTimer = setTimeout(
        animateStep,
        Number(speedSelect.value)
    );
}



function finishSimulation() {
    isRunning = false;
    isPaused = false;

    clearTimeout(animationTimer);
    animationTimer = null;

    startBtn.disabled = false;
    pauseBtn.disabled = true;
    pauseBtn.textContent = "Pause";

    enableInputControls();

    showMessage("Simulation completed successfully.", "success");
}


function displayResults() {
    const stats = simulationData.statistics;

    document.getElementById("avg-waiting").textContent =
        stats.average_waiting_time;

    document.getElementById("avg-turnaround").textContent =
        stats.average_turnaround_time;

    document.getElementById("total-burst").textContent =
        stats.total_burst_time;

    document.getElementById("total-finish").textContent =
        stats.total_finish_time;

    document.getElementById("cpu-utilization").textContent =
        `${stats.cpu_utilization}%`;

    document.getElementById("throughput").textContent =
        stats.throughput;

    document.getElementById("preemptions").textContent =
        simulationData.preemption_count;

    resultsTableBody.replaceChildren();

    simulationData.jobs.forEach(job => {
        const row = document.createElement("tr");

        const values = [
            job.job_id,
            job.job_name,
            job.arrival_time,
            job.duration,
            job.completion_time,
            job.turnaround_time,
            job.waiting_time
        ];

        values.forEach(value => {
            const cell = document.createElement("td");

            cell.textContent = value ?? "-";

            row.appendChild(cell);
        });

        resultsTableBody.appendChild(row);
    });
}


addJobBtn.addEventListener("click", addJob);

clearJobsBtn.addEventListener("click", clearJobs);

startBtn.addEventListener("click", startSimulation);

pauseBtn.addEventListener("click", togglePause);

resetBtn.addEventListener("click", resetSimulation);

// The user can now upload their own CSV file.
showMessage("Add jobs manually or click Input CSV to upload a file.");