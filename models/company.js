"use strict";

const db = require("../db");
const { BadRequestError, NotFoundError } = require("../expressError");
const { sqlForPartialUpdate } = require("../helpers/sql");

/** Related functions for companies. */

class Company {
  /** Create a company (from data), update db, return new company data.
   *
   * data should be { handle, name, description, numEmployees, logoUrl }
   *
   * Returns { handle, name, description, numEmployees, logoUrl }
   *
   * Throws BadRequestError if company already in database.
   * */

  static async create({ handle, name, description, numEmployees, logoUrl }) {
    const duplicateCheck = await db.query(
          `SELECT handle
           FROM companies
           WHERE handle = $1`,
        [handle]);

    if (duplicateCheck.rows[0])
      throw new BadRequestError(`Duplicate company: ${handle}`);

    const result = await db.query(
          `INSERT INTO companies
           (handle, name, description, num_employees, logo_url)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING handle, name, description, num_employees AS "numEmployees", logo_url AS "logoUrl"`,
        [
          handle,
          name,
          description,
          numEmployees,
          logoUrl,
        ],
    );
    const company = result.rows[0];

    return company;
  }

  /** Find all companies.
   *
   * Returns [{ handle, name, description, numEmployees, logoUrl }, ...]
   * */

  static async findAll(searchFilters= {}) {
    let query =`SELECT handle,
                  name,
                  description,
                  num_employees AS "numEmployees",
                  logo_url AS "logoUrl"
           FROM companies`;
    let whereExpressions = [];
    let queryValues = [];

    const { minEmployees, maxEmployees, name } = searchFilters;

    if (minEmployees > maxEmployees) {
      throw new BadRequestError("Min employees cannot be greater than max");
    }

    if (minEmployees !== undefined) {
      queryValues.push(minEmployees);
      whereExpressions.push(`num_employees >= $${queryValues.length}`);
    }

    if (maxEmployees !== undefined) {
      queryValues.push(maxEmployees);
      whereExpressions.push(`num_employees <= $${queryValues.length}`);
    }

    if (name) {
      queryValues.push(`%${name}%`);
      whereExpressions.push(`name ILIKE $${queryValues.length}`);
    }

    if (whereExpressions.length > 0) {
      query += " WHERE " + whereExpressions.join(" AND ");
    }

    query += " ORDER BY name";
    const companiesRes = await db.query(query, queryValues);
    return companiesRes.rows;
  }



  /** Given a company handle, return data about company.
   *
   * Returns { handle, name, description, numEmployees, logoUrl, jobs }
   *   where jobs is [{ id, title, salary, equity, companyHandle }, ...]
   *
   * Throws NotFoundError if not found.
   **/

  static async get(handle) {
    const companyRes = await db.query(
          `SELECT handle,
                  name,
                  description,
                  num_employees AS "numEmployees",
                  logo_url AS "logoUrl"
           FROM companies
           WHERE handle = $1`,
        [handle]);

    const company = companyRes.rows[0];

    if (!company) throw new NotFoundError(`No company: ${handle}`);

    const jobsRes = await db.query(
      `SELECT id, title, salary, equity
       FROM jobs
       WHERE company_handle = $1
       ORDER BY id`,
    [handle],
    );

    company.jobs = jobsRes.rows;

    return company;
  }


//name: filter by company name: 
static async get(name) {
  const companyRes = await db.query(
        `SELECT handle,
                name,
                description,
                num_employees AS "numEmployees",
                logo_url AS "logoUrl"
         FROM companies
         WHERE name = $1`,
      [name]);

  const company = companyRes.rows[0];

  if (!company) throw new NotFoundError(`No company: ${name}`);

  return company;
}



// name: filter by company name: if the string “net” is passed in, this should find any company who name contains the word “net”, case-insensitive (so “Study Networks” should be included).
  static async get(name) {
    const companyRes = await db.query(
          `SELECT handle,
                  name,
                  description,
                  num_employees AS "numEmployees",
                  logo_url AS "logoUrl"
           FROM companies
           WHERE lower(name) LIKE '%' || lower($1) || '%'`,
        [name]);

    const companies = companyRes.rows;

    if (companies.length === 0) throw new NotFoundError(`No companies found containing: ${name}`);

    return companies;
  }

  //- ***minEmployees***: filter to companies that have at least that number of employees.
  // ***maxEmployees***: filter to companies that have no more than that number of employees.

//   static async get(searchTerm, minEmployees, maxEmployees) {
//     let query = `
//         SELECT handle,
//                name,
//                description,
//                num_employees AS "numEmployees",
//                logo_url AS "logoUrl"
//         FROM companies
//         WHERE lower(name) LIKE '%' || lower($1) || '%'
//     `;
//     const params = [searchTerm];

//     // Add filters for minEmployees and maxEmployees if provided
//     if (minEmployees !== undefined && maxEmployees !== undefined) {
//       query += ` AND num_employees BETWEEN $${params.length + 1} AND $${params.length + 2}`;
//       params.push(minEmployees);
//       params.push(maxEmployees);
//   } else if (minEmployees !== undefined) {
//       query += ` AND num_employees >= $${params.length + 1}`;
//       params.push(minEmployees);
//   } else if (maxEmployees !== undefined) {
//       query += ` AND num_employees <= $${params.length + 1}`;
//       params.push(maxEmployees);
//   }

//   const companyRes = await db.query(query, params);
//   const companies = companyRes.rows;

//   return companies;
// }
        


  /** Update company data with `data`.
   *
   * This is a "partial update" --- it's fine if data doesn't contain all the
   * fields; this only changes provided ones.
   *
   * Data can include: {name, description, numEmployees, logoUrl}
   *
   * Returns {handle, name, description, numEmployees, logoUrl}
   *
   * Throws NotFoundError if not found.
   */

  static async update(handle, data) {
    const { setCols, values } = sqlForPartialUpdate(
        data,
        {
          numEmployees: "num_employees",
          logoUrl: "logo_url",
        });
    const handleVarIdx = "$" + (values.length + 1);

    const querySql = `UPDATE companies 
                      SET ${setCols} 
                      WHERE handle = ${handleVarIdx} 
                      RETURNING handle, 
                                name, 
                                description, 
                                num_employees AS "numEmployees", 
                                logo_url AS "logoUrl"`;
    const result = await db.query(querySql, [...values, handle]);
    const company = result.rows[0];

    if (!company) throw new NotFoundError(`No company: ${handle}`);

    return company;
  }

  /** Delete given company from database; returns undefined.
   *
   * Throws NotFoundError if company not found.
   **/

  static async remove(handle) {
    const result = await db.query(
          `DELETE
           FROM companies
           WHERE handle = $1
           RETURNING handle`,
        [handle]);
    const company = result.rows[0];

    if (!company) throw new NotFoundError(`No company: ${handle}`);
  }
}


module.exports = Company;
