// Mock email provider class (simulates a failure/success)
class MockEmailProvider {
    constructor(name) {
      this.name = name;
    }
  
    // Simulate sending an email with a success/failure rate
    async sendEmail(email) {
      const success = Math.random() > 0.3; // 70% chance of success
      if (!success) {
        throw new Error(`Failed to send email via ${this.name}`);
      }
      console.log(`Email sent successfully via ${this.name}`);
      return true;
    }
  }
  
  // CircuitBreaker class
  class CircuitBreaker {
    constructor() {
      this.failureCount = 0;
      this.failureThreshold = 3;
      this.resetTimeout = 10000; // Reset after 10 seconds
      this.lastFailureTime = null;
    }
  
    shouldAttempt() {
      if (this.failureCount >= this.failureThreshold) {
        if (Date.now() - this.lastFailureTime > this.resetTimeout) {
          this.reset();
          return true;
        }
        return false;
      }
      return true;
    }
  
    recordFailure() {
      this.failureCount++;
      this.lastFailureTime = Date.now();
    }
  
    reset() {
      this.failureCount = 0;
    }
  }
  
  // EmailService class
  class EmailService {
    static MAX_RETRIES = 5;
    static RETRY_DELAY_MS = 1000; // Initial delay for backoff in ms
    static RATE_LIMIT_MS = 2000; // Rate limit between email sends (2 seconds)
    static MAX_ATTEMPTS = 3;
  
    constructor() {
      this.providerA = new MockEmailProvider('ProviderA');
      this.providerB = new MockEmailProvider('ProviderB');
      this.lastSendTime = 0;
      this.statusTracking = [];
      this.circuitBreaker = new CircuitBreaker();
    }
  
    // Delay for rate limiting
    async delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  
    // Implementing Rate Limiting
    async rateLimit() {
      const currentTime = Date.now();
      if (currentTime - this.lastSendTime < EmailService.RATE_LIMIT_MS) {
        await this.delay(EmailService.RATE_LIMIT_MS - (currentTime - this.lastSendTime));
      }
      this.lastSendTime = Date.now();
    }
  
    // Retry logic with exponential backoff
    async sendEmailWithProvider(provider, email, attempt = 1) {
      const status = { success: false, provider: provider.name, attemptCount: attempt };
  
      try {
        const result = await provider.sendEmail(email);
        status.success = result;
      } catch (error) {
        console.log(`Attempt ${attempt} failed: ${error.message}`);
        if (attempt < EmailService.MAX_RETRIES) {
          await this.delay(EmailService.RETRY_DELAY_MS * Math.pow(2, attempt - 1)); // Exponential backoff
          return await this.sendEmailWithProvider(provider, email, attempt + 1); // Retry
        } else {
          status.errorMessage = error.message;
        }
      }
  
      return status;
    }
  
    // Fallback to another provider if the first one fails
    async sendEmail(email) {
      await this.rateLimit();
  
      if (!this.circuitBreaker.shouldAttempt()) {
        console.log("Circuit breaker triggered. Skipping email sending.");
        return { success: false, errorMessage: "Circuit breaker is open" };
      }
  
      // First try ProviderA
      let status = await this.sendEmailWithProvider(this.providerA, email);
  
      if (!status.success) {
        console.log("Falling back to ProviderB");
        status = await this.sendEmailWithProvider(this.providerB, email);
      }
  
      // Track status
      this.statusTracking.push(status);
      return status;
    }
  }
  
  // Simple Queue System (for email requests)
  class EmailQueue {
    constructor() {
      this.queue = [];
      this.isProcessing = false;
    }
  
    // Adds an email to the queue and processes it
    enqueue(emailService, email) {
      this.queue.push(email);
      if (!this.isProcessing) {
        this.processQueue(emailService);
      }
    }
  
    // Processes each email in the queue
    async processQueue(emailService) {
      this.isProcessing = true;
      while (this.queue.length > 0) {
        const email = this.queue.shift();
        console.log(`Processing email to ${email.to}`);
        await emailService.sendEmail(email);
      }
      this.isProcessing = false;
    }
  }

  document.getElementById("sendEmailButton").addEventListener("click", async () => {
    const emailService = new EmailService();
    const email = { to: "user@example.com", subject: "Test", body: "This is a test email" };
    const result = await emailService.sendEmail(email);
    document.getElementById("status").innerText = `Status: ${result.success ? 'Success' : 'Failed'} | Provider: ${result.provider} | Attempts: ${result.attemptCount}`;
    if (result.errorMessage) {
      document.getElementById("status").classList.add('error');
      document.getElementById("status").innerText += ` | Error: ${result.errorMessage}`;
    } else {
      document.getElementById("status").classList.add('success');
    }
  });
  