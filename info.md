You are building on an existing SaaS CRM project (Clienta AI) that already has multi-tenant architecture, AWS Cognito auth, DynamoDB, Lambda backend, and React frontend.

Goal: Extend the system into a full CRM by adding the following **essential features**:

1. Contact & Lead Management
   - DynamoDB table for customers/leads with fields: id, name, email, phone, company, status (prospect, active, past).
   - API endpoints for CRUD operations on contacts/leads.
   - React UI components for viewing, adding, editing, and segmenting contacts.

2. Sales Pipeline Tracking
   - DynamoDB table for deals with fields: id, contact_id, stage (Lead, Qualified, Proposal, Closed), value, notes.
   - API endpoints for moving deals through stages.
   - React Kanban-style board to visualize pipeline stages.

3. Basic Marketing Automation
   - Ability to send email campaigns via SES (AWS Simple Email Service).
   - Store campaign templates in DynamoDB.
   - Trigger automated follow-ups (e.g., after signup).
   - Use aliases like marketing@clientaai.com for sending.

4. Customer Support Tools
   - DynamoDB table for tickets with fields: id, contact_id, subject, status (open, in progress, resolved), created_at.
   - API endpoints for ticket creation and updates.
   - React UI for customers to submit tickets and admins to manage them.
   - Integrate support@clientaai.com for incoming requests.
   - Use no-reply@clientaai.com for automated responses.

Constraints:
- Keep schema minimal and consistent with existing single-table DynamoDB design.
- Use AWS Lambda + API Gateway for backend endpoints.
- Use React components with TailwindCSS for UI.
- Ensure multi-tenant support (tenant_id included in all tables).
- Keep code modular and easy to extend later.

Deliverables:
- DynamoDB schema updates
- Lambda functions for CRUD + workflows
- React components for contacts, pipeline, campaigns, tickets
- Example SES integration for sending emails