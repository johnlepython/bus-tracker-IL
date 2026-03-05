/**
 * Detect if a vehicle number represents a train
 * Buses have 7, 8, or 9 digits in their vehicle numbers
 * Anything else (3-4-5-6 digits, 10+, or non-numeric) is a train
 */
export function isTrainNumber(vehicleNumber: string | undefined | null): boolean {
	if (!vehicleNumber) return false;
	const num = vehicleNumber.trim();
	const digits = num.replace(/\D/g, "");
	const digitCount = digits.length;
	// Buses have 7, 8, or 9 digits; everything else is a train
	return digitCount < 7 || digitCount > 9;
}
