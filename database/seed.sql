-- SAMPLE data for development only. Replace with a real, verified doctor directory.
insert into doctors (name, specialty, clinic, city, lat, lng, languages, fee_inr, rating, teleconsult) values
 ('Dr. Ananya Rao','General Physician','Care Clinic, Banjara Hills','Hyderabad',17.4126,78.4482,'{English,Telugu,Hindi}',500,4.6,true),
 ('Dr. Imran Khan','Cardiologist','HeartFirst, Jubilee Hills','Hyderabad',17.4326,78.4071,'{English,Hindi,Urdu}',900,4.7,true),
 ('Dr. Lakshmi Reddy','Dermatologist','SkinWell, Madhapur','Hyderabad',17.4483,78.3915,'{English,Telugu}',700,4.5,false),
 ('Dr. Suresh Kumar','Pediatrician','Little Steps, Kukatpally','Hyderabad',17.4948,78.3996,'{English,Telugu,Hindi}',600,4.8,true),
 ('Dr. Priya Nair','Gynecologist','Women''s Health Centre, Gachibowli','Hyderabad',17.4401,78.3489,'{English,Hindi}',800,4.6,false),
 ('Dr. Arjun Mehta','Endocrinologist','Diabetes & Hormone Clinic','Hyderabad',17.4239,78.4738,'{English,Hindi}',850,4.4,true),
 ('Dr. Kavya Iyer','Orthopedist','BoneCare, Secunderabad','Hyderabad',17.4399,78.4983,'{English,Tamil,Telugu}',750,4.5,false),
 ('Dr. Rahul Verma','Gastroenterologist','Gut Health Clinic, Somajiguda','Hyderabad',17.4239,78.4562,'{English,Hindi}',900,4.6,true),
 ('Dr. Sneha Pillai','Neurologist','NeuroCentre, Begumpet','Hyderabad',17.4435,78.4677,'{English,Malayalam,Hindi}',1000,4.7,true),
 ('Dr. Naveen Chary','Ophthalmologist','Clear Vision, Ameerpet','Hyderabad',17.4375,78.4483,'{English,Telugu}',600,4.5,false),
 ('Dr. Farah Siddiqui','Pulmonologist','Breathe Well Clinic, Tolichowki','Hyderabad',17.4009,78.4170,'{English,Urdu,Hindi}',850,4.6,true),
 ('Dr. Manoj Reddy','Urologist','Urocare, Dilsukhnagar','Hyderabad',17.3688,78.5247,'{English,Telugu}',800,4.4,false);

-- 5 days x 6 slots for every doctor, 10:00 to 15:00 IST
insert into doctor_slots (doctor_id, starts_at)
select d.id, (date_trunc('day', now() at time zone 'Asia/Kolkata') + (g.day || ' days')::interval + (h.hr || ' hours')::interval) at time zone 'Asia/Kolkata'
from doctors d, generate_series(1,5) as g(day), generate_series(10,15) as h(hr);
