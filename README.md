# AssistScribe
### AI-Assisted Accessible Computing and Note-Taking System

AssistScribe is a hackathon-developed assistive technology platform designed to improve computer accessibility for individuals with limited hand mobility. The project combines a custom-built sip-and-puff input controller with an AI-powered predictive note-taking application to enable hands-free computer interaction.

The system allows users to control cursor movement, mouse clicks, and text input using only mouth-operated controls and intelligent word prediction.

---

# Project Overview

Traditional computer input devices such as keyboards and mice can be difficult or impossible for some users to operate. AssistScribe was created to provide a low-cost, accessible alternative using commonly available hardware and machine learning-assisted typing.

The project consists of two integrated systems:

## 1. Sip-and-Puff Assistive Controller

A custom hardware interface using:
- Arduino microcontroller
- Pressure sensor
- Analog joystick
- Mouthpiece input system

The controller enables:
- Cursor movement using joystick input
- Sip detection for left mouse click
- Puff detection for right mouse click

## 2. AssistScribe AI Note-Taking Software

An intelligent note-taking application featuring:
- On-screen keyboard
- Neural-network-assisted word prediction
- Adaptive text suggestions
- Faster typing with reduced physical effort

Together, these systems create a fully accessible computer interaction platform.

---

# Features

## Hardware Features
- Hands-free mouse movement
- Sip-and-puff click controls
- Low-cost hardware implementation
- USB connectivity
- Lightweight and portable design
- Real-time input response

## Software Features
- AI-assisted predictive typing
- On-screen keyboard interface
- Word learning and prediction
- Reduced keystroke count
- Accessibility-focused workflow
- Designed for integration with assistive input devices

---

# Hardware Components

| Component | Purpose |
|---|---|
| Arduino Leonardo / Micro | Main controller |
| Pressure Sensor | Detects sip and puff input |
| Analog Joystick | Controls mouse movement |
| Mouthpiece Assembly | User interaction interface |
| USB Connection | Communication with PC |

> Arduino Leonardo or Arduino Micro is recommended due to native USB HID support for mouse control.

---

# System Architecture

```text
+-------------------+
| Mouthpiece Input  |
+-------------------+
         |
         v
+-------------------+
| Pressure Sensor   |
| + Joystick Input  |
+-------------------+
         |
         v
+-------------------+
| Arduino Controller|
+-------------------+
         |
         v
+-------------------+
| Computer / PC     |
+-------------------+
         |
         v
+-------------------+
| AssistScribe App  |
| AI Word Prediction|
+-------------------+
```

---

# How It Works

## Cursor Control
The joystick mounted on the mouthpiece is used to move the mouse cursor around the screen.

## Sip-and-Puff Detection
The pressure sensor continuously monitors air pressure changes.

### Controls

| Action | Function |
|---|---|
| Sip | Left Mouse Click |
| Puff | Right Mouse Click |

The Arduino processes these pressure changes and sends the appropriate mouse commands to the computer.

## AI-Assisted Typing

The AssistScribe software provides an on-screen keyboard with predictive typing support. The neural network learns commonly used words and predicts likely completions while the user types.

This reduces:
- Typing effort
- Number of selections required
- Overall communication time

---

# Technologies Used

## Hardware
- Arduino
- Analog pressure sensing
- USB HID mouse emulation
- Analog joystick control

## Software
- Python
- Neural networks / machine learning
- Predictive text algorithms
- GUI-based accessibility tools

---

# Installation

## Hardware Setup

### Wiring
Connect:
- Pressure sensor to Arduino analog input
- Joystick X/Y outputs to analog inputs
- Arduino to PC via USB

### Requirements
- Arduino IDE
- USB cable
- Arduino Leonardo or Micro recommended

---

# Arduino Setup

## Required Libraries

Install:

```cpp
#include <Mouse.h>
```

## Upload Steps

1. Open Arduino IDE
2. Connect Arduino board
3. Select correct board and COM port
4. Upload the Arduino sketch
5. Launch the AssistScribe application

---

# Example Arduino Logic

```cpp
if (sipDetected) {
    Mouse.click(MOUSE_LEFT);
}

if (puffDetected) {
    Mouse.click(MOUSE_RIGHT);
}
```

---

# Running the Software

## Starting AssistScribe

1. Connect the hardware device
2. Upload the Arduino firmware
3. Launch the AssistScribe application
4. Begin using the on-screen keyboard and predictive typing system

---

# Accessibility Goals

AssistScribe was designed with the following goals:
- Improve computer accessibility
- Reduce barriers to communication
- Provide affordable assistive technology
- Support users with limited motor control
- Enable hands-free interaction

---

# Potential Applications

- Assistive communication
- Accessible note-taking
- Educational accessibility
- Rehabilitation technology
- Alternative computer input systems
- Accessibility research

---

# Future Improvements

## Hardware
- Wireless Bluetooth connectivity
- Adjustable pressure sensitivity
- Improved mouthpiece ergonomics
- Compact PCB design
- Battery-powered operation

## Software
- Improved neural network accuracy
- Personalized language models
- Voice synthesis integration
- Full desktop accessibility support
- Customisable controls
- Multi-language support

---

# Challenges Faced

During development, several engineering and software challenges were encountered:
- Filtering noisy pressure sensor readings
- Preventing false sip/puff detection
- Calibrating joystick sensitivity
- Creating responsive real-time control
- Integrating AI prediction with assistive input workflows

---

# Project Inspiration

This project was inspired by the need for affordable and accessible assistive technology solutions. Many commercial accessibility systems are expensive and difficult to customize. AssistScribe demonstrates that effective assistive technology can be created using low-cost hardware and open-source tools.

---

# Team

Developed as part of a hackathon project focused on:
- Accessibility
- Human-computer interaction
- Embedded systems
- AI-assisted communication

---

# Repository Structure

```text
saasathon/
│
├── arduino/
│   └── assistive_controller.ino
│
├── software/
│   └── assistscribe_app/
│
├── assets/
│   └── images/
│
├── docs/
│
└── README.md
```

---

# Contributing

Contributions, improvements, and accessibility suggestions are welcome.

Potential areas for contribution:
- Machine learning improvements
- Hardware optimization
- Accessibility testing
- UI/UX enhancements
- Cross-platform support

---

# License

This project was created for educational and hackathon purposes.

---

# Acknowledgements

Special thanks to:
- Hackathon organizers
- Open-source accessibility communities
- Arduino ecosystem contributors
- Users and testers providing accessibility feedback

---

# Project Status

Prototype / Proof of Concept

The current implementation demonstrates the core functionality of:
- Sip-and-puff input
- Cursor control
- AI-assisted predictive note-taking

Future iterations may further improve reliability, usability, and accessibility support.