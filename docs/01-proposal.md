# Project proposal — Campus Shuttle Tracking & Demand Prediction

**BCS 305 Software Architecture · Fall 2026 · Instructor: Dr. Khaled Ammar**  
**Team:** Abdullah (`abdullahshammari796-ctrl`) · Zuhair Halawa (`zuhairhalawa`) — *student IDs: to be added* · Team of two (the brief allows three ± one)

**Problem.** Students on UAE campuses that run shuttle buses cannot see where a shuttle is or when it will reach their stop, so they wait outdoors — often in extreme heat — or miss it; the transport office plans vehicles without data on where and when students actually wait.

**Users and stakeholders.**
* **Students** — want to know when to walk to the stop, without being tracked themselves.
* **Shuttle drivers** — want to run trips with minimal interaction and without being blamed for GPS faults.
* **Transport office staff** — want to see the fleet live, react to incidents and plan capacity from evidence.
* Also affected: university IT (operates the system) and the data-protection officer (location and identity data).

**What the system will do.**
1. Show every running shuttle on a campus map, live, with arrival estimates for any stop.
2. Let drivers start and end trips and share their position, including a GPS simulator so the system can be demonstrated without vehicles, and keep working through GPS and network interruptions.
3. Let students say "I'm waiting here" at a stop, giving the office a live and historical demand signal.
4. Give the transport office a live operations view, route management, trip history and audit log.
5. Show demand trends and explainable demand forecasts per stop and hour, with an honest evaluation.

**Quality attribute that will be hard to achieve — timeliness *and honesty* of information under unreliable GPS and connectivity.** Updates must reach hundreds of viewers within about a second, but when a shuttle's GPS or mobile data drops out the system must say so ("location delayed", "GPS lost") instead of showing a confident but wrong arrival time, and must recover, delivering positions buffered during short outages. Privacy of location data is the second hard concern.

**Planned prototype.** A locally runnable web application (Node.js/TypeScript, SQLite, browser clients for the three roles) implementing end to end: *run a trip and track it live* (driver → server → many students, including outage handling) and *register a waiting request feeding the office's demand view and forecast*. Forecasting starts with explainable baselines; synthetic demonstration data will be clearly labelled as such.

*Approval status: OUTSTANDING — record the date the instructor approved the topic.*
