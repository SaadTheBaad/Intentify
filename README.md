# Intentify

**Intent-first communication for people with speech impairments**

Intentify is an assistive communication app designed to help people express their intended meaning even when spoken output is incomplete, atypical, or difficult to understand.

Instead of requiring clear or fluent speech, Intentify focuses on intent-first communication. It allows users to map imperfect speech to user-approved meanings that they explicitly confirm.

---

## Inspiration

Many communication systems assume:
- Speech is fluent
- Words are retrieved easily
- Meaning must be delivered clearly and in real time

This creates a systemic accessibility bias.

People with speech impairments such as aphasia, apraxia of speech, post-stroke language impairment, or severe stuttering often know exactly what they want to say but cannot reliably articulate it under pressure. When systems fail to interpret their speech, the result is often silence, exclusion, or misunderstanding.

Intentify was inspired by the idea that **noise in speech should not result in silence**.

---

## What It Does

Intentify enables users to communicate by confirming intent rather than perfect speech.

Users can:
- Record short voice clips, even if speech is incomplete or noisy
- Build a personal library of short, meaningful intent phrases
- Select or confirm the intended meaning of their speech
- Reuse confirmed intents over time

The system:
- Matches recorded speech against the user’s intent library
- Suggests likely intents based on meaning
- Uses AI only when confidence is low
- Always requires explicit user confirmation before saving or acting

The user stays in control at every step.

---

## Why This Matters (Bias Mitigation)

Intentify addresses a hidden accessibility bias:  
**the assumption that fluent speech is required to participate.**

By separating intent from delivery, Intentify:
- Prevents noisy speech from becoming silence
- Preserves user agency and dignity
- Reduces frustration in high-pressure communication moments
- Enables participation in healthcare, work, emergencies, and daily life

This aligns directly with equity, accessibility, and inclusive system design.

---

## How We Used AI

AI is used carefully and intentionally in Intentify.

- Semantic embeddings are used to match speech to stored intents based on meaning, not exact wording
- A language model suggests a new intent only when no strong match exists
- AI never makes final decisions or outputs without user confirmation

AI assists, but the user always decides.

---

## Technical Architecture

### Frontend
- Expo + React Native
- Simple, low-friction UI
- Large tap targets and calm language
- Automatic processing after recording

### Backend
- AWS Serverless architecture using AWS SAM
- API Gateway + AWS Lambda (Node.js)
- Amazon S3 for secure audio storage using presigned URLs
- DynamoDB for intent and recording metadata

### Data Flow
1. User records audio on device
2. Audio is uploaded directly to S3 via presigned PUT URL
3. Backend processes the audio and extracts meaning
4. Stored intents are matched using semantic similarity
5. AI suggests a new intent if confidence is low
6. User confirms the intended meaning
7. Metadata is saved for future use

---

## Privacy & Ethics

- User data is processed only to fulfill user actions
- AI suggestions are never auto-accepted
- No user data is used to train models
- The system avoids enforcing normative speech standards

Intentify is designed to be ethical, transparent, and user-controlled.

---

## Challenges We Ran Into

- Designing AI assistance without removing user agency
- Handling imperfect and highly variable speech inputs
- Balancing confidence thresholds for intent matching
- Scoping a meaningful assistive system within hackathon constraints

---

## Accomplishments We Are Proud Of

- Building an intent-first communication model instead of speech correction
- Designing AI as a fallback, not a gatekeeper
- Creating a system that prioritizes dignity and consent
- Delivering a working end-to-end prototype within a hackathon

---

## What We Learned

- Communication tools must account for human variability
- Accessibility is as much psychological as it is technical
- Small confirmation steps can dramatically reduce user stress
- Inclusive design requires rethinking assumptions, not just adding features

---

## What’s Next for Intentify

- Offline mode for critical situations
- User authentication with login and signup
- User preferences for voice and output customization
- Speech correction assistance
- A custom language model trained specifically for intent-first communication

---

## Built With

- Expo
- React Native
- AWS Lambda
- API Gateway
- Amazon S3
- DynamoDB
- OpenAI APIs

---

## Motto

**“Don’t fix speech. Fix how systems listen.”**
