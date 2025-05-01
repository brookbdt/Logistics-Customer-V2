-- Update existing UNCLAIMED values to BEING_REVIEWED
UPDATE `Order` SET `orderStatus` = 'BEING_REVIEWED' WHERE `orderStatus` = 'UNCLAIMED';

-- Update existing CLAIMED values to ACCEPTED
UPDATE `Order` SET `orderStatus` = 'ACCEPTED' WHERE `orderStatus` = 'CLAIMED';
