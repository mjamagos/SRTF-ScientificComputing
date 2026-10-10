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


// Simulation variables
let simulationData = null;
let currentTime = 0;
let animationTimer = null;

let isRunning = false;
let isPaused = false;

const UNIT_WIDTH = 44;


// Map each job ID to its color index.
let jobColorMap = {};


function showMessage(message, type = "") {
    jobMessage.textContent = message;
    jobMessage.className = type;
}

// Add a job using the input form.
function addJob() {
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

    // Prevent duplicate job IDs.
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

    // Clear the form after adding a job.
    jobIdInput.value = "";
    jobNameInput.value = "";
    arrivalInput.value = "";
    durationInput.value = "";

    showMessage(`${jobId} added successfully.`, "success");
}


// Add one row to the job table.
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


// Read jobs from the HTML table.
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


// Clear all input jobs.
function clearJobs() {
    stopAnimation();

    jobTableBody.replaceChildren();

    showMessage("All jobs have been cleared.", "success");

    resetDisplay();
}


// --------------------------------------------------
// LOAD SAMPLE CSV DATA
// --------------------------------------------------

async function loadSampleJobs() {
    stopAnimation();

    try {
        showMessage("Loading sample jobs...", "");

        const response = await fetch("/api/sample-jobs");

        // Read the response safely to detect HTML error pages.
        const responseText = await response.text();

        let data;

        try {
            data = JSON.parse(responseText);
        } catch {
            throw new Error(
                "Flask returned HTML instead of JSON. Check the /api/sample-jobs route."
            );
        }

        if (!response.ok) {
            throw new Error(data.error || "Failed to load sample jobs.");
        }

        jobTableBody.replaceChildren();

        data.jobs.forEach(job => {
            addJobToTable(job);
        });

        resetDisplay();

        showMessage(
            `${data.jobs.length} sample jobs loaded successfully.`,
            "success"
        );

    } catch (error) {
        console.error("CSV loading error:", error);

        showMessage(error.message, "error");
    }
}


async function startSimulation() {
    if (isRunning) return;

    stopAnimation();
    resetDisplay();

    const jobs = getJobs();

    if (jobs.length === 0) {
        showMessage("Add jobs or load the sample CSV first.", "error");
        return;
    }

    try {
        showMessage("Calculating SRTF schedule...", "");

        startBtn.disabled = true;
        loadCsvBtn.disabled = true;
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

        // Assign colors according to the input job order.
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

// Pause or resume the animation.
function togglePause() {
    if (!isRunning) return;

    isPaused = !isPaused;

    if (isPaused) {
        clearTimeout(animationTimer);
        pauseBtn.textContent = "Resume";
        showMessage("Simulation paused.", "");
    } else {
        pauseBtn.textContent = "Pause";
        showMessage("Simulation resumed.", "success");
        animateStep();
    }
}


// Stop any active timer.
function stopAnimation() {
    clearTimeout(animationTimer);

    isRunning = false;
    isPaused = false;
}


// Reset the simulation output but keep the input jobs.
function resetSimulation() {
    stopAnimation();
    resetDisplay();

    showMessage("Simulation has been reset.", "");
}


// Clear all simulation output.
function resetDisplay() {
    currentTime = 0;
    simulationData = null;

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


// Enable the job input controls.
function enableInputControls() {
    startBtn.disabled = false;
    loadCsvBtn.disabled = false;
    addJobBtn.disabled = false;
    clearJobsBtn.disabled = false;
}


// Add the initial time marker.
function prepareTimeline() {
    ganttTimeline.replaceChildren();

    addTimelineMarker(0);
}


// Add a time marker to the timeline.
function addTimelineMarker(time) {
    const marker = document.createElement("span");

    marker.textContent = time;
    marker.style.width = `${UNIT_WIDTH}px`;

    ganttTimeline.appendChild(marker);
}

// Add one unit of execution to the Gantt chart.
// Consecutive units of the same job are merged visually.
function addGanttUnit(jobId, time) {
    const children = [...ganttChart.children];
    const lastBlock = children[children.length - 1];

    const className = jobId === null
        ? "idle"
        : `job-${jobColorMap[jobId] ?? 0}`;

    // Merge adjacent time units belonging to the same job.
    if (
        lastBlock &&
        lastBlock.dataset.jobId === (jobId ?? "IDLE") &&
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
        block.dataset.jobId = jobId ?? "IDLE";
        block.dataset.start = time;
        block.dataset.end = time + 1;

        block.style.width = `${UNIT_WIDTH}px`;

        block.textContent = jobId ?? "Idle";

        block.title = `${jobId ?? "CPU Idle"}: ${time} - ${time + 1}`;

        ganttChart.appendChild(block);
    }

    addTimelineMarker(time + 1);
}


// Find the job running at the specified time.
function getRunningSegment(time) {
    return simulationData.gantt_chart.find(segment =>
        segment.start <= time && time < segment.end
    ) || null;
}


// Calculate remaining time based on the actual Gantt segments.
function getRemainingTime(jobId, time) {
    const job = simulationData.jobs.find(item => item.job_id === jobId);

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


// Display the job currently using the CPU.
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


// Display the ready queue using the latest queue snapshot.
function updateReadyQueue(time) {
    const queueEvent = [...simulationData.events]
        .filter(event =>
            event.time <= time &&
            (event.type === "QUEUE_PUSH" || event.type === "QUEUE_POP")
        )
        .at(-1);

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


// Display events occurring at the current time.
function displayEventsAt(time) {
    simulationData.events
        .filter(event => event.time === time)
        .forEach(event => {
            const entry = document.createElement("div");

            entry.textContent =
                `[T=${event.time}] ${formatEvent(event)}`;

            eventLog.appendChild(entry);
        });

    // Keep the newest event visible.
    eventLog.scrollTop = eventLog.scrollHeight;
}


function animateStep() {
    if (!isRunning || isPaused || !simulationData) return;

    const finishTime = simulationData.statistics.total_finish_time;

    // Handle final-time events after the last execution unit.
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

    // Display events such as arrivals and preemptions.
    displayEventsAt(currentTime);

    // Update CPU and queue state.
    const runningJob = updateCPU(currentTime);

    updateReadyQueue(currentTime);

    // Add the current time unit to the Gantt chart.
    addGanttUnit(runningJob, currentTime);

    // Advance simulation time by one unit.
    currentTime++;

    clockValue.textContent = currentTime;

    // Schedule the next animation step.
    animationTimer = setTimeout(
        animateStep,
        Number(speedSelect.value)
    );
}

// Complete the simulation.
function finishSimulation() {
    isRunning = false;
    isPaused = false;

    clearTimeout(animationTimer);

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

loadCsvBtn.addEventListener("click", loadSampleJobs);

clearJobsBtn.addEventListener("click", clearJobs);

startBtn.addEventListener("click", startSimulation);

pauseBtn.addEventListener("click", togglePause);

resetBtn.addEventListener("click", resetSimulation);

// Load the actual samplejobs.csv data when the page opens.
loadSampleJobs();