/**
 * Detect if a vehicle number represents a train
 * Trains have 3-4 digit numbers
 */
export function isTrainNumber(vehicleNumber: string | undefined | null): boolean {
	if (!vehicleNumber) return false;
	const num = vehicleNumber.trim();
	const digits = num.replace(/\D/g, "");
	return /^[0-9]+$/.test(digits) && digits.length >= 3 && digits.length <= 4;
}
