import serial
import pyautogui
import time

# =========================
# SETTINGS
# =========================

SERIAL_PORT = "COM9"
BAUD_RATE = 9600

DEADZONE = 110
MAX_SPEED = 10

PRESSURE_OFFSET = 50
CLICK_COOLDOWN = 0.4

# Joystick direction settings
INVERT_X = False
INVERT_Y = False
SWAP_AXES = False

# Smoothness setting
SMOOTHING = 0.35
# Lower = smoother but more delayed
# Higher = faster response but more jumpy

pyautogui.PAUSE = 0

# =========================
# SERIAL SETUP
# =========================

arduino = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
time.sleep(2)

print("Reading Arduino...")
print("Keep joystick centred and do not sip/puff for 2 seconds...")

# =========================
# STARTUP CALIBRATION
# =========================

pressure_values = []
joy_x_values = []
joy_y_values = []

start_time = time.time()

while time.time() - start_time < 2:
    line = arduino.readline().decode(errors="ignore").strip()

    try:
        parts = line.split(",")

        if len(parts) == 3:
            joy_x_values.append(int(parts[0]))
            joy_y_values.append(int(parts[1]))
            pressure_values.append(int(parts[2]))

    except:
        pass

if len(pressure_values) == 0:
    print("No valid data received.")
    arduino.close()
    exit()

centre_x = sum(joy_x_values) / len(joy_x_values)
centre_y = sum(joy_y_values) / len(joy_y_values)
baseline_pressure = sum(pressure_values) / len(pressure_values)

left_click_threshold = baseline_pressure - PRESSURE_OFFSET
right_click_threshold = baseline_pressure + PRESSURE_OFFSET

print(f"Joystick centre X: {centre_x:.1f}")
print(f"Joystick centre Y: {centre_y:.1f}")
print(f"Pressure baseline: {baseline_pressure:.1f} Pa")
print(f"Left click below: {left_click_threshold:.1f} Pa")
print(f"Right click above: {right_click_threshold:.1f} Pa")
print(f"Joystick deadzone: {DEADZONE}")
print("Mouse control active.")
print("Press CTRL + C to stop.")

last_click_time = 0

smooth_x = 0
smooth_y = 0

# =========================
# FUNCTIONS
# =========================

def map_movement(value):
    if abs(value) < DEADZONE:
        return 0

    direction = 1 if value > 0 else -1
    magnitude = min(abs(value), 512)

    # Remove deadzone before scaling
    magnitude = magnitude - DEADZONE

    max_input = 512 - DEADZONE

    # Curved response:
    # small joystick movement = slow/precise
    # large joystick movement = faster
    ratio = magnitude / max_input
    speed = ratio * ratio * MAX_SPEED

    if speed < 1:
        speed = 1

    return speed * direction

# =========================
# MAIN LOOP
# =========================

try:
    while True:
        line = arduino.readline().decode(errors="ignore").strip()

        if not line:
            continue

        parts = line.split(",")

        if len(parts) != 3:
            continue

        try:
            joy_x = int(parts[0])
            joy_y = int(parts[1])
            pressure = int(parts[2])

        except ValueError:
            continue

        # =========================
        # JOYSTICK MOVEMENT
        # =========================

        x_move = joy_x - centre_x
        y_move = joy_y - centre_y

        if SWAP_AXES:
            x_move, y_move = y_move, x_move

        if INVERT_X:
            x_move = -x_move

        if INVERT_Y:
            y_move = -y_move

        # Stop X instantly when joystick is inside deadzone
        if abs(x_move) < DEADZONE:
            target_x = 0
            smooth_x = 0
        else:
            target_x = map_movement(x_move)

        # Stop Y instantly when joystick is inside deadzone
        if abs(y_move) < DEADZONE:
            target_y = 0
            smooth_y = 0
        else:
            target_y = map_movement(y_move)

        # Smooth only when outside deadzone
        smooth_x = smooth_x + SMOOTHING * (target_x - smooth_x)
        smooth_y = smooth_y + SMOOTHING * (target_y - smooth_y)

        move_x = int(round(smooth_x))
        move_y = int(round(smooth_y))

        if move_x != 0 or move_y != 0:
            pyautogui.moveRel(move_x, move_y)

        # =========================
        # PRESSURE CLICK CONTROL
        # =========================

        current_time = time.time()

        if current_time - last_click_time > CLICK_COOLDOWN:

            # 50 Pa above baseline = right click
            if pressure > right_click_threshold:
                pyautogui.click(button="right")
                print(f"Right click | Pressure: {pressure}")
                last_click_time = current_time

            # 50 Pa below baseline = left click
            elif pressure < left_click_threshold:
                pyautogui.click(button="left")
                print(f"Left click | Pressure: {pressure}")
                last_click_time = current_time

except KeyboardInterrupt:
    print("Stopped.")
    arduino.close()
