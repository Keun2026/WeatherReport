/**
 * @file contact.js
 * @description Handles client-side form validation, user feedback alerts, 
 * and local text file exporting for contact form submissions.
 * 
 * -----------------------------------------------------------------
 * OVERVIEW
 * Main script for the contact page. It manages the form submission lifecycle,
 * validates user inputs (such as names, email formats, and message content),
 * displays status alerts, and handles local data formatting for exports.
 *
 * CLASSES: FormHandler (or similar class structure if applicable).
 * PARENT CLASSES: none.
 *
 * USAGE: loaded on the contact page:
 *     <script src="contact.js"></script>
 */

// FormHandler class encapsulates DOM references, field validation rules, file generation, and submit event handling.
class FormHandler {
  // Initializes instance variables by binding references to target HTML input fields and UI elements.
  constructor(formId) {
    // Queries and stores DOM node references for the form element, input fields, and status message container.
    this.form = document.getElementById(formId);
    this.nameInput = document.getElementById("fullName");
    this.emailInput = document.getElementById("email");
    this.messageInput = document.getElementById("message");
    this.formStatus = document.getElementById("formStatus");
  }

  /**
   * Validates form inputs using string manipulation and logical operators.
   * @returns {boolean} True if all fields are valid.
   */

  // Evaluates validity of each form input, applies Bootstrap validation styling classes, and returns overall pass status.
  validate() {
    let isValid = true;

    // 1. Name Validation (Trimming whitespace)
    const nameVal = this.nameInput.value.trim();
    if (nameVal.length < 2) {
      // Applies Bootstrap invalid styling state if name input contains fewer than 2 non-whitespace characters.
      this.nameInput.classList.add("is-invalid");
      isValid = false;
    } else {
      // Clears invalid state and applies Bootstrap success styling class if name input passes validation.
      this.nameInput.classList.remove("is-invalid");
      this.nameInput.classList.add("is-valid");
    }

    // 2. Email Validation (Checking format)
    const emailVal = this.emailInput.value.trim();
    if (!emailVal.includes("@") || !emailVal.includes(".")) {
      // Applies Bootstrap invalid styling state if email input lacks basic structure requirements.
      this.emailInput.classList.add("is-invalid");
      isValid = false;
    } else {
      // Clears invalid state and applies Bootstrap success styling class if email input passes validation.
      this.emailInput.classList.remove("is-invalid");
      this.emailInput.classList.add("is-valid");
    }

    // 3. Message Validation
    const messageVal = this.messageInput.value.trim();
    if (messageVal.length === 0) {
      // Applies Bootstrap invalid styling state if message body is empty after stripping whitespace.
      this.messageInput.classList.add("is-invalid");
      isValid = false;
    } else {
      // Clears invalid state and applies Bootstrap success styling class if message input passes validation.
      this.messageInput.classList.remove("is-invalid");
      this.messageInput.classList.add("is-valid");
    }

    // Returns boolean indicating whether all input validation checks passed successfully.
    return isValid;
  }

  /**
   * Generates and triggers a text file download (Read/Write file requirement).
   */

  // Formats submitted input values and triggers a programmatic text file download in the browser.
  exportToTextFile() {
    // Formats form field values and a timestamp into a formatted plain-text string.
    const textData = `=== WEATHER FORECAST CONTACT SUBMISSION ===\nName: ${this.nameInput.value.trim()}\nEmail: ${this.emailInput.value.trim()}\nMessage: ${this.messageInput.value.trim()}\nTimestamp: ${new Date().toLocaleString()}`;

    // Creates an in-memory Blob object containing the raw text string and generates a temporary anchor tag to prompt the file download.
    const blob = new Blob([textData], { type: "text/plain;charset=utf-8" });
    const tempLink = document.createElement("a");
    // Assigns an object URL reference pointing to the Blob and sets the target download filename.
    tempLink.href = URL.createObjectURL(blob);
    tempLink.download = "contact_submission.txt";
    
    // Auto-click link to initiate browser file download
    tempLink.click();
  }

  // Binds submission event listeners and coordinates validation, file exports, and UI status updates.
  init() {
    // Listens for form submission events and executes handler logic.
    this.form.addEventListener("submit", (e) => {
      // Prevents native form submission and browser page refresh.
      e.preventDefault();

      // Executes validation check and branches workflow based on returned boolean value.
      if (this.validate()) {
        // Triggers automated text file download, updates UI status to success, and resets form fields.
        this.exportToTextFile();
        
        this.formStatus.className = "alert alert-success";
        this.formStatus.textContent = "Thank you! Your feedback has been submitted and saved to contact_submission.txt.";
        this.form.reset();
        
        // Remove valid styling after reset
        [this.nameInput, this.emailInput, this.messageInput].forEach(input => {
          // Removes green success borders from form input elements post-reset.
          input.classList.remove("is-valid");
        });
      } else {
        // Updates UI status message container with red error alert styling.
        this.formStatus.className = "alert alert-danger";
        this.formStatus.textContent = "Please correct the highlighted errors above.";
      }
    });
  }
}

// Initialize Form Validation Handler
// Instantiates FormHandler with the target form ID and attaches submit event listeners upon script load.
const contactApp = new FormHandler("contact");
contactApp.init();