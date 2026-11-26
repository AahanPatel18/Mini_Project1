// Scripts load after the HTML elements; these IDs connect the code to index.html.
const courseFileInput = document.getElementById("course-file");
const courseList = document.getElementById("course-list");
const courseCount = document.getElementById("course-count");
const courseEmptyMessage = document.getElementById("course-empty");
const loadStatus = document.getElementById("load-status");
const errorMessage = document.getElementById("error-message");
const detailsContent = document.getElementById("details-content");
const detailsPlaceholder = document.getElementById("details-placeholder");
const sortSelect = document.getElementById("sort-by");

// Department/semester are text fields; level/credits are numeric fields.
const filterElements = {
    department: document.getElementById("department-filter"),
    level: document.getElementById("level-filter"),
    credits: document.getElementById("credits-filter"),
    semester: document.getElementById("semester-filter")
};

const detailElements = {
    id: document.getElementById("detail-id"),
    title: document.getElementById("detail-title"),
    department: document.getElementById("detail-department"),
    level: document.getElementById("detail-level"),
    credits: document.getElementById("detail-credits"),
    instructor: document.getElementById("detail-instructor"),
    semester: document.getElementById("detail-semester"),
    description: document.getElementById("detail-description")
};

// These are the field names we display/filter, not hard-coded category values.
const filterFields = ["department", "level", "credits", "semester"];
const detailFields = ["id", "title", "department", "level", "credits", "instructor", "semester", "description"];

// Keep upload order in courses. Rebuild visibleCourses for each filter/sort change.
// Track the selected Course object itself because different entries can share an ID.
let courses = [];
let visibleCourses = [];
let selectedCourse = null;
let activeReader = null;
let courseButtons = [];
let selectedButton = null;

function setLoadStatus(message) {
    loadStatus.textContent = message;
    loadStatus.hidden = message === "";
}

function showLoadError(message) {
    const previousDataNotice = courses.length > 0
        ? " Your previously loaded course data and filters have been kept."
        : "";

    errorMessage.textContent = message + previousDataNotice;
    errorMessage.hidden = false;
    // Reset the chooser so selecting the same file again can trigger another change event.
    courseFileInput.value = "";
    setLoadStatus("");
}

function parseCourseData(text) {
    // trim also handles whitespace-only files and a leading Unicode byte-order mark (BOM).
    const content = text.trim();

    if (content === "") {
        throw new Error("The selected file is empty. Choose a JSON file containing courses.");
    }

    let data;

    try {
        data = JSON.parse(content);
    } catch (error) {
        throw new Error("The selected file contains invalid JSON. Check its formatting and try again.");
    }

    // Expected root shape: an array of course objects. An empty array is valid and shows no courses.
    if (!Course.isCourseList(data)) {
        throw new Error("Course data must be an array of course objects enclosed in square brackets.");
    }

    const loadedCourses = [];
    let skippedEntries = 0;

    // Keep valid records from mixed input and report skipped entries. Course fills missing object fields.
    data.forEach(entry => {
        try {
            loadedCourses.push(new Course(entry));
        } catch (error) {
            skippedEntries += 1;
        }
    });

    if (data.length > 0 && loadedCourses.length === 0) {
        throw new Error("The file does not contain any valid course objects.");
    }

    return { courses: loadedCourses, skippedEntries: skippedEntries };
}

// Dropdown values are strings; the empty string means All.
// __missing__ identifies null numeric fields and cannot collide with a normalized number.
function getFilterValue(value) {
    return value === null ? "__missing__" : String(value);
}

function isDigit(character) {
    return character >= "0" && character <= "9";
}

// Compare digit groups numerically so IDs such as CS2 still come before CS10.
function compareText(first, second) {
    const firstText = first.toLowerCase();
    const secondText = second.toLowerCase();
    let firstIndex = 0;
    let secondIndex = 0;

    while (firstIndex < firstText.length && secondIndex < secondText.length) {
        const firstCharacter = firstText.charAt(firstIndex);
        const secondCharacter = secondText.charAt(secondIndex);

        if (isDigit(firstCharacter) && isDigit(secondCharacter)) {
            let firstStart = firstIndex;
            let secondStart = secondIndex;

            while (firstIndex < firstText.length && isDigit(firstText.charAt(firstIndex))) {
                firstIndex += 1;
            }
            while (secondIndex < secondText.length && isDigit(secondText.charAt(secondIndex))) {
                secondIndex += 1;
            }

            // Ignore leading zeroes and compare digit counts before comparing individual digits.
            // This avoids losing precision when an ID contains a very long number.
            while (firstStart < firstIndex - 1 && firstText.charAt(firstStart) === "0") {
                firstStart += 1;
            }
            while (secondStart < secondIndex - 1 && secondText.charAt(secondStart) === "0") {
                secondStart += 1;
            }

            const firstLength = firstIndex - firstStart;
            const secondLength = secondIndex - secondStart;
            if (firstLength !== secondLength) {
                return firstLength - secondLength;
            }

            for (let i = 0; i < firstLength; i++) {
                if (firstText.charAt(firstStart + i) < secondText.charAt(secondStart + i)) {
                    return -1;
                }
                if (firstText.charAt(firstStart + i) > secondText.charAt(secondStart + i)) {
                    return 1;
                }
            }
        } else {
            if (firstCharacter < secondCharacter) {
                return -1;
            }
            if (firstCharacter > secondCharacter) {
                return 1;
            }
            firstIndex += 1;
            secondIndex += 1;
        }
    }

    return (firstText.length - firstIndex) - (secondText.length - secondIndex);
}

function compareFilterOptions(first, second) {
    if (first === null) {
        return second === null ? 0 : 1;
    }
    if (second === null) {
        return -1;
    }
    if (typeof first === "number") {
        return first - second;
    }
    return compareText(first, second);
}

function populateFilters() {
    for (let i = 0; i < filterFields.length; i++) {
        const field = filterFields[i];
        const select = filterElements[field];
        const allLabel = select.options[0].textContent;

        // Clear only existing markup; uploaded values are inserted below with textContent.
        select.innerHTML = "";
        const allOption = document.createElement("option");
        allOption.value = "";
        allOption.textContent = allLabel;
        select.appendChild(allOption);

        // Set is explicitly permitted by the assignment; map and spread are covered in the lessons.
        const values = [...new Set(courses.map(course => course[field]))];
        values.sort(compareFilterOptions);

        values.forEach(value => {
            const option = document.createElement("option");
            option.value = getFilterValue(value);
            option.textContent = value ?? "Not specified";
            select.appendChild(option);
        });

        // Successful replacement uploads reset filters; an empty dataset leaves the controls disabled.
        select.value = "";
        select.disabled = courses.length === 0;
    }
}

function getSemesterSortKey(semester) {
    if (typeof semester !== "string") {
        return null;
    }

    // The README assumes "Term YYYY". Check the two parts using split, indexing, and comparisons.
    const parts = semester.split(" ");
    if (parts.length !== 2 || parts[1].length !== 4) {
        return null;
    }

    for (let i = 0; i < parts[1].length; i++) {
        if (!isDigit(parts[1].charAt(i))) {
            return null;
        }
    }

    // Four positions per year put Winter, Spring, Summer, and Fall in chronological order.
    const terms = ["Winter", "Spring", "Summer", "Fall"];
    for (let i = 0; i < terms.length; i++) {
        if (parts[0] === terms[i]) {
            return Number(parts[1]) * 4 + i;
        }
    }
    return null;
}

function compareSemesters(first, second) {
    const firstKey = getSemesterSortKey(first);
    const secondKey = getSemesterSortKey(second);

    // null means missing/invalid: place those entries last, and compare two invalid entries equally.
    if (firstKey === null) {
        return secondKey === null ? 0 : 1;
    }

    if (secondKey === null) {
        return -1;
    }

    return firstKey - secondKey;
}

function sortVisibleCourses() {
    const sortBy = sortSelect.value;

    if (sortBy === "title" || sortBy === "id") {
        // sort mutates only the filtered array, leaving the original upload order intact.
        visibleCourses.sort((first, second) => compareText(first[sortBy], second[sortBy]));
    } else if (sortBy === "semester") {
        visibleCourses.sort((first, second) => compareSemesters(first.semester, second.semester));
    }
}

function updateCourseList() {
    // The required filter method keeps a course only when it passes all four selections.
    // A fresh array also lets the None sorting choice restore the uploaded order.
    visibleCourses = courses.filter(course => {
        for (let i = 0; i < filterFields.length; i++) {
            const field = filterFields[i];
            const selectedValue = filterElements[field].value;
            if (selectedValue !== "" && getFilterValue(course[field]) !== selectedValue) {
                return false;
            }
        }
        return true;
    });

    sortVisibleCourses();
    renderCourses();
}

function hasActiveFilters() {
    for (let i = 0; i < filterFields.length; i++) {
        if (filterElements[filterFields[i]].value !== "") {
            return true;
        }
    }
    return false;
}

function createCourseLabel(className, text) {
    const label = document.createElement("span");
    label.className = className;
    // Uploaded text is displayed literally rather than being interpreted as HTML.
    label.textContent = text;
    return label;
}

function createCourseItem(course, index) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const credits = course.credits === null
        ? "Credits not specified"
        : `${course.credits} ${course.credits === 1 ? "credit" : "credits"}`;

    button.type = "button";
    button.className = "course-item";
    button.title = course.getFormattedDetails();
    // Row positions identify buttons even when multiple courses have the same ID.
    button.id = "course-row-" + index;
    button.setAttribute("aria-controls", "course-details");
    button.appendChild(createCourseLabel("course-code", course.id));
    button.appendChild(createCourseLabel("course-title", course.title));
    button.appendChild(createCourseLabel("course-meta", `${course.semester} · ${credits}`));

    // As in the events lesson, an anonymous function passes an argument to the named handler.
    button.addEventListener("click", function () {
        selectCourse(index);
    });

    item.appendChild(button);
    return item;
}

function selectCourse(index) {
    const course = visibleCourses[index];

    if (!course) {
        return;
    }

    // Move the visible Selected badge and aria-current state so exactly one row is marked as current.
    if (selectedButton !== null) {
        selectedButton.className = "course-item";
        selectedButton.setAttribute("aria-current", "false");
        selectedButton.querySelector(".course-code").textContent = selectedCourse.id;
    }

    selectedCourse = course;
    selectedButton = courseButtons[index];
    selectedButton.className = "course-item selected";
    selectedButton.setAttribute("aria-current", "true");
    selectedButton.querySelector(".course-code").appendChild(createCourseLabel("selected-label", "Selected"));

    // ?? keeps numeric 0 visible while showing a consistent label for null/undefined values.
    for (let i = 0; i < detailFields.length; i++) {
        const field = detailFields[i];
        detailElements[field].textContent = course[field] ?? "Not specified";
    }

    detailsPlaceholder.hidden = true;
    detailsContent.hidden = false;
}

function formatCourseCount(count) {
    return `${count} ${count === 1 ? "course" : "courses"}`;
}

function renderCourses() {
    courseList.innerHTML = "";
    selectedButton = null;

    visibleCourses.forEach((course, index) => {
        courseList.appendChild(createCourseItem(course, index));
    });

    // Refresh the NodeList after rebuilding the buttons, as in the DOM tutorial.
    courseButtons = courseList.querySelectorAll(".course-item");
    courseCount.textContent = hasActiveFilters()
        ? `${visibleCourses.length} of ${formatCourseCount(courses.length)}`
        : formatCourseCount(visibleCourses.length);
    courseEmptyMessage.hidden = visibleCourses.length > 0;

    if (visibleCourses.length > 0) {
        // Preserve the focused object if it still matches; otherwise select the first visible course.
        let selectedIndex = 0;
        for (let i = 0; i < visibleCourses.length; i++) {
            if (visibleCourses[i] === selectedCourse) {
                selectedIndex = i;
            }
        }
        selectCourse(selectedIndex);
    } else {
        // Clear stale details for empty files and for filter combinations with no matching courses.
        selectedCourse = null;
        courseEmptyMessage.textContent = courses.length === 0
            ? "The selected file contains no courses."
            : "No courses match the selected filters. Try changing a filter.";
        detailsContent.hidden = true;
        detailsPlaceholder.hidden = false;

        for (let i = 0; i < detailFields.length; i++) {
            detailElements[detailFields[i]].textContent = "";
        }
    }
}

function handleReadError(reader) {
    if (reader !== activeReader) {
        return;
    }

    activeReader = null;
    courseList.setAttribute("aria-busy", "false");
    showLoadError("The file could not be read. Select it again or choose another JSON file.");
}

function handleCourseFileChange() {
    // A newer selection replaces any pending read; late events from the old reader must be ignored.
    if (activeReader) {
        const previousReader = activeReader;
        activeReader = null;
        previousReader.abort();
    }

    courseList.setAttribute("aria-busy", "false");
    errorMessage.textContent = "";
    errorMessage.hidden = true;
    setLoadStatus("");

    const file = courseFileInput.files[0];

    if (!file) {
        return;
    }

    if (file.size === 0) {
        showLoadError("The selected file is empty. Choose a JSON file containing courses.");
        return;
    }

    const reader = new FileReader();
    activeReader = reader;
    courseList.setAttribute("aria-busy", "true");
    setLoadStatus(`Loading ${file.name}…`);

    reader.addEventListener("load", () => {
        // Only the latest file selection may replace the displayed data.
        if (reader !== activeReader) {
            return;
        }

        try {
            const result = parseCourseData(reader.result);
            // Replace the existing data only after parsing succeeds; reset filters, sorting, and selection.
            courses = result.courses;
            selectedCourse = null;
            populateFilters();
            sortSelect.value = "";
            sortSelect.disabled = courses.length === 0;
            updateCourseList();

            const skippedNotice = result.skippedEntries > 0
                ? ` Skipped ${result.skippedEntries} invalid ${result.skippedEntries === 1 ? "entry" : "entries"}.`
                : "";

            setLoadStatus(`${formatCourseCount(courses.length)} loaded from ${file.name}.${skippedNotice}`);
        } catch (error) {
            showLoadError(error.message);
        } finally {
            activeReader = null;
            courseList.setAttribute("aria-busy", "false");
        }
    });

    reader.addEventListener("error", () => handleReadError(reader));

    try {
        // FileReader reads the manually selected browser File locally.
        reader.readAsText(file);
    } catch (error) {
        handleReadError(reader);
    }
}

courseFileInput.addEventListener("change", handleCourseFileChange);

// Recalculate the filtered and sorted results whenever a dropdown changes.
for (let i = 0; i < filterFields.length; i++) {
    filterElements[filterFields[i]].addEventListener("change", updateCourseList);
}

sortSelect.addEventListener("change", updateCourseList);
