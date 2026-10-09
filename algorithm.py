import csv
from pathlib import Path


def validate_jobs(jobs):
    # Check if all jobs have valid information
    validated_jobs = []
    seen_ids = set()

    for job in jobs:
        job_id = str(job.get("job_id", "")).strip()
        job_name = str(job.get("job_name", "")).strip()

        if not job_id:
            raise ValueError("Job ID cannot be empty.")

        if not job_name:
            raise ValueError(f"Job name cannot be empty for {job_id}.")

        if job_id in seen_ids:
            raise ValueError(f"Duplicate Job ID: {job_id}")

        seen_ids.add(job_id)

        try:
            arrival_value = float(str(job.get("arrival_time", "")).strip())
            duration_value = float(str(job.get("duration", "")).strip())
        except (ValueError, TypeError):
            raise ValueError(
                f"Invalid arrival time or duration for {job_id}."
            )

        if not arrival_value.is_integer() or not duration_value.is_integer():
            raise ValueError(
                f"Arrival time and duration must be whole numbers for {job_id}."
            )

        arrival_time = int(arrival_value)
        duration = int(duration_value)

        if arrival_time < 0:
            raise ValueError(f"Arrival time cannot be negative for {job_id}.")

        if duration <= 0:
            raise ValueError(f"Duration must be greater than zero for {job_id}.")

        validated_jobs.append({
            "job_id": job_id,
            "job_name": job_name,
            "arrival_time": arrival_time,
            "duration": duration,
        })

    return sorted(
        validated_jobs,
        key=lambda job: (job["arrival_time"], job["job_id"])
    )


def load_jobs(filename="samplejobs.csv"):
    # Load jobs from the CSV file
    file_path = Path(__file__).resolve().parent / filename

    if not file_path.exists():
        raise FileNotFoundError(f"CSV file not found: {file_path}")

    jobs = []

    with open(file_path, "r", newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)

        required_columns = {
            "Job ID",
            "Job Name",
            "Arrival Time",
            "Estimated Duration",
        }

        if not reader.fieldnames:
            raise ValueError("The CSV file is empty or has no header.")

        actual_columns = {
            column.strip() for column in reader.fieldnames if column
        }

        if not required_columns.issubset(actual_columns):
            raise ValueError(
                "CSV must contain: Job ID, Job Name, Arrival Time, "
                "Estimated Duration."
            )

        for row in reader:
            # Skip empty rows
            if not row or not any(
                str(value or "").strip() for value in row.values()
            ):
                continue

            jobs.append({
                "job_id": row.get("Job ID", ""),
                "job_name": row.get("Job Name", ""),
                "arrival_time": row.get("Arrival Time", ""),
                "duration": row.get("Estimated Duration", ""),
            })

    if not jobs:
        raise ValueError("No jobs found in the CSV file.")

    return validate_jobs(jobs)


def add_event(events, time, event_type, **details):
    # Save an event for the animation and event log
    event = {
        "time": time,
        "type": event_type,
        **details,
    }
    events.append(event)


def add_gantt_segment(gantt_chart, job_id, start, end):
    # Merge consecutive segments from the same job
    if start >= end:
        return

    if (
        gantt_chart
        and gantt_chart[-1]["job_id"] == job_id
        and gantt_chart[-1]["end"] == start
    ):
        gantt_chart[-1]["end"] = end
    else:
        gantt_chart.append({
            "job_id": job_id,
            "start": start,
            "end": end,
        })


def simulate_srtf(jobs):
    # Prepare the jobs and simulation data
    jobs = validate_jobs(jobs)

    if not jobs:
        raise ValueError("At least one job is required.")

    job_data = {}

    for job in jobs:
        job_data[job["job_id"]] = {
            **job,
            "remaining_time": job["duration"],
            "start_time": None,
            "completion_time": None,
            "waiting_time": 0,
            "turnaround_time": 0,
            "response_time": None,
        }

    events = []
    gantt_chart = []
    ready_queue = []

    current_time = 0
    next_job_index = 0
    current_job_id = None
    preemption_count = 0
    total_burst_time = sum(job["duration"] for job in jobs)

    # Add jobs that have arrived
    def add_arrived_jobs():
        nonlocal next_job_index

        while (
            next_job_index < len(jobs)
            and jobs[next_job_index]["arrival_time"] <= current_time
        ):
            job = jobs[next_job_index]
            job_id = job["job_id"]

            ready_queue.append(job_id)

            add_event(
                events,
                current_time,
                "ARRIVAL",
                job_id=job_id,
                job_name=job["job_name"],
            )

            add_event(
                events,
                current_time,
                "QUEUE_PUSH",
                job_id=job_id,
                queue=list(ready_queue),
            )

            next_job_index += 1

    # Sort jobs by their remaining time
    def sort_ready_queue():
        ready_queue.sort(
            key=lambda job_id: (
                job_data[job_id]["remaining_time"],
                job_data[job_id]["arrival_time"],
                job_id,
            )
        )

    while (
        next_job_index < len(jobs)
        or ready_queue
        or current_job_id is not None
    ):
        # Add jobs that have arrived
        add_arrived_jobs()

        # Record idle time if no job is ready
        if current_job_id is None and not ready_queue:
            next_arrival = jobs[next_job_index]["arrival_time"]

            if next_arrival > current_time:
                add_event(
                    events,
                    current_time,
                    "CPU_IDLE",
                    end_time=next_arrival,
                )
                current_time = next_arrival

            add_arrived_jobs()

        # Check if a shorter job should replace the running job
        if current_job_id is not None and ready_queue:
            sort_ready_queue()
            shortest_job_id = ready_queue[0]

            if (
                job_data[shortest_job_id]["remaining_time"]
                < job_data[current_job_id]["remaining_time"]
            ):
                old_job_id = current_job_id
                ready_queue.append(old_job_id)

                add_event(
                    events,
                    current_time,
                    "PREEMPTION",
                    job_id=old_job_id,
                    replaced_by=shortest_job_id,
                )

                add_event(
                    events,
                    current_time,
                    "QUEUE_PUSH",
                    job_id=old_job_id,
                    queue=list(ready_queue),
                )

                current_job_id = None
                preemption_count += 1

        # Pick the job with the shortest remaining time
        if current_job_id is None and ready_queue:
            sort_ready_queue()
            current_job_id = ready_queue.pop(0)

            add_event(
                events,
                current_time,
                "QUEUE_POP",
                job_id=current_job_id,
                queue=list(ready_queue),
            )

            current_job = job_data[current_job_id]

            if current_job["start_time"] is None:
                current_job["start_time"] = current_time
                current_job["response_time"] = (
                    current_time - current_job["arrival_time"]
                )

                add_event(
                    events,
                    current_time,
                    "DISPATCH",
                    job_id=current_job_id,
                    job_name=current_job["job_name"],
                )
            else:
                add_event(
                    events,
                    current_time,
                    "RESUME",
                    job_id=current_job_id,
                    job_name=current_job["job_name"],
                )

        # Run the selected job for one time unit
        if current_job_id is not None:
            current_job = job_data[current_job_id]
            start_time = current_time

            add_gantt_segment(
                gantt_chart,
                current_job_id,
                start_time,
                start_time + 1,
            )

            current_job["remaining_time"] -= 1
            current_time += 1

            add_event(
                events,
                current_time,
                "EXECUTION",
                job_id=current_job_id,
                remaining_time=current_job["remaining_time"],
            )

            # Finish the job when its remaining time reaches zero
            if current_job["remaining_time"] == 0:
                current_job["completion_time"] = current_time
                current_job["turnaround_time"] = (
                    current_time - current_job["arrival_time"]
                )
                current_job["waiting_time"] = (
                    current_job["turnaround_time"] - current_job["duration"]
                )

                add_event(
                    events,
                    current_time,
                    "COMPLETION",
                    job_id=current_job_id,
                    job_name=current_job["job_name"],
                )

                current_job_id = None

    # Calculate the final statistics
    total_finish_time = max(
        job["completion_time"] for job in job_data.values()
    )

    job_count = len(job_data)

    average_waiting_time = sum(
        job["waiting_time"] for job in job_data.values()
    ) / job_count

    average_turnaround_time = sum(
        job["turnaround_time"] for job in job_data.values()
    ) / job_count

    cpu_utilization = (
        (total_burst_time / total_finish_time) * 100
        if total_finish_time > 0
        else 0
    )

    # Calculate throughput in jobs per millisecond
    throughput = (
        job_count / total_finish_time
        if total_finish_time > 0
        else 0
    )

    completed_jobs = [
        {
            "job_id": job["job_id"],
            "job_name": job["job_name"],
            "arrival_time": job["arrival_time"],
            "duration": job["duration"],
            "start_time": job["start_time"],
            "completion_time": job["completion_time"],
            "waiting_time": job["waiting_time"],
            "turnaround_time": job["turnaround_time"],
            "response_time": job["response_time"],
        }
        for job in job_data.values()
    ]

    statistics = {
        "total_burst_time": total_burst_time,
        "total_finish_time": total_finish_time,
        "average_waiting_time": round(average_waiting_time, 2),
        "average_turnaround_time": round(average_turnaround_time, 2),
        "cpu_utilization": round(cpu_utilization, 2),
        "throughput": round(throughput, 4),
    }

    return {
        "jobs": completed_jobs,
        "events": events,
        "gantt_chart": gantt_chart,
        "statistics": statistics,
        "preemption_count": preemption_count,
    }


if __name__ == "__main__":
    # Run the scheduler using the sample CSV file
    try:
        jobs = load_jobs()
        result = simulate_srtf(jobs)

        print("\nSRTF Scheduling Results")
        print("=" * 40)

        print("\nGantt Chart:")
        for segment in result["gantt_chart"]:
            print(
                f'{segment["start"]} - {segment["end"]}: '
                f'{segment["job_id"]}'
            )

        print("\nJob Details:")
        for job in result["jobs"]:
            print(
                f'{job["job_id"]} - {job["job_name"]} | '
                f'Finish: {job["completion_time"]} | '
                f'Waiting: {job["waiting_time"]} | '
                f'Turnaround: {job["turnaround_time"]}'
            )

        print("\nFinal Statistics:")
        stats = result["statistics"]

        print(f'Total Burst Time: {stats["total_burst_time"]} job/ms')
        print(f'Total Finish Time: {stats["total_finish_time"]} job/ms')
        print(f'AWT: {stats["average_waiting_time"]} job/ms')
        print(f'ATAT: {stats["average_turnaround_time"]} job/ms')
        print(f'CPU Utilization: {stats["cpu_utilization"]}%')
        print(f'Throughput: {stats["throughput"]} jobs/ms')

    except (ValueError, FileNotFoundError) as error:
        print(f"Error: {error}")