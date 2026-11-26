class Course {
    constructor(data = {}) {
        // Missing fields are allowed, but each record must be an object rather than an array or primitive.
        if (data === null || typeof data !== "object" || Course.isCourseList(data)) {
            throw new TypeError("Course data must be an object.");
        }

        // These defaults keep missing values consistent throughout the page.
        this.__id__ = Course.normalizeText(data.id, "Unknown ID");
        this.__title__ = Course.normalizeText(data.title, "Untitled course");
        this.__department__ = Course.normalizeText(data.department, "Unknown department");
        this.__level__ = Course.normalizeNumber(data.level);
        this.__credits__ = Course.normalizeNumber(data.credits);
        this.__instructor__ = Course.normalizeText(data.instructor, "Not assigned");
        this.__description__ = Course.normalizeText(data.description, "No description available.");
        this.__semester__ = Course.normalizeText(data.semester, "Not specified");
    }

    // Getter names match the JSON keys, so filtering and sorting can read course[field].
    get id() {
        return this.__id__;
    }

    get title() {
        return this.__title__;
    }

    get department() {
        return this.__department__;
    }

    get level() {
        return this.__level__;
    }

    get credits() {
        return this.__credits__;
    }

    get instructor() {
        return this.__instructor__;
    }

    get description() {
        return this.__description__;
    }

    get semester() {
        return this.__semester__;
    }

    // Plain-text details are used in course tooltips. ?? preserves legitimate values such as 0 credits.
    getFormattedDetails() {
        return [
            `Course ID: ${this.id}`,
            `Title: ${this.title}`,
            `Department: ${this.department}`,
            `Level: ${this.level ?? "Not specified"}`,
            `Credits: ${this.credits ?? "Not specified"}`,
            `Instructor: ${this.instructor}`,
            `Semester: ${this.semester}`,
            `Description: ${this.description}`
        ].join("\n");
    }

    // Input comes from JSON: arrays provide forEach, while plain JSON objects cannot contain functions.
    // This checks the list shape; individual entries are checked separately by the constructor.
    static isCourseList(value) {
        return value !== null && typeof value === "object" && typeof value.forEach === "function";
    }

    // Only non-empty strings count as text; other types and whitespace-only strings use the fallback.
    static normalizeText(value, fallback) {
        if (typeof value === "string" && value.trim() !== "") {
            return value.trim();
        }

        return fallback;
    }

    // Assumption: levels and credits are finite, non-negative JSON numbers, not numeric strings.
    // Zero and decimals are allowed; null marks missing/invalid numbers without turning them into 0.
    static normalizeNumber(value) {
        if (typeof value === "number" && value >= 0 && value < Infinity) {
            return value;
        }

        return null;
    }
}
